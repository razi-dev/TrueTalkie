package expo.modules.localmesh

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.net.ConnectivityManager
import android.net.wifi.WifiManager
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.concurrent.thread

class LocalMeshModule : Module() {

  // --- UDP Signaling (Port 8888 default) ---
  private var signalingSocket: DatagramSocket? = null
  private var signalingListenThread: Thread? = null
  @Volatile private var isListening = false

  // --- Voice Audio Streaming UDP (Port 8889 default) ---
  private var audioSocket: DatagramSocket? = null
  private var audioListenThread: Thread? = null
  private var audioRecordThread: Thread? = null
  private var audioRecord: AudioRecord? = null
  private var audioTrack: AudioTrack? = null

  @Volatile private var isAudioReceiving = false
  @Volatile private var isAudioTransmitting = false
  @Volatile private var currentAudioChannel: String = ""
  @Volatile private var mySenderHash: Int = 0
  @Volatile private var activePeerIps: List<String> = emptyList()

  private var multicastLock: WifiManager.MulticastLock? = null

  companion object {
    private const val TAG = "LocalMeshAudio"
    private const val SAMPLE_RATE = 16000
    private const val SAMPLES_PER_FRAME = 320 // 20 ms at 16000 Hz
    private const val BYTES_PER_FRAME = 640  // 320 samples * 2 bytes (16-bit mono)
    private const val MAGIC_0: Byte = 0x54    // 'T'
    private const val MAGIC_1: Byte = 0x54    // 'T'
    private const val CODEC_PCM: Byte = 0x02
    private const val HEADER_SIZE = 14
  }

  override fun definition() = ModuleDefinition {
    Name("LocalMesh")

    Events("onMessage", "onAudioStateChanged")

    // --- Signaling Methods ---
    AsyncFunction("start") { port: Int ->
      startListening(port)
    }

    AsyncFunction("stop") {
      stopListening()
    }

    AsyncFunction("sendBroadcast") { message: String, port: Int ->
      broadcastMessage(message, port)
    }

    AsyncFunction("sendDirect") { targetIp: String, port: Int, message: String ->
      directMessage(targetIp, port, message)
    }

    Function("getLocalIpAddress") {
      findLocalIpAddress()
    }

    // --- High-Performance UDP Audio Methods ---
    AsyncFunction("startAudioReceiver") { channelCode: String, port: Int ->
      startAudioReceiverInternal(channelCode, port)
    }

    AsyncFunction("stopAudioReceiver") {
      stopAudioReceiverInternal()
    }

    AsyncFunction("startTransmittingAudio") { channelCode: String, port: Int, myDeviceId: String, peerIps: List<String>? ->
      startTransmittingAudioInternal(channelCode, port, myDeviceId, peerIps ?: emptyList())
    }

    AsyncFunction("stopTransmittingAudio") {
      stopTransmittingAudioInternal()
    }

    AsyncFunction("updatePeerIps") { ips: List<String> ->
      activePeerIps = ips.filter { it.isNotBlank() }.distinct()
    }

    AsyncFunction("setSpeakerphone") { enabled: Boolean ->
      setSpeakerphoneInternal(enabled)
    }
  }

  // =========================================================================
  // Signaling Implementation (Port 8888)
  // =========================================================================

  private fun startListening(port: Int) {
    if (isListening) return
    isListening = true
    acquireMulticastLock()

    thread(isDaemon = true, name = "LocalMeshSignalingReceiver") {
      try {
        val s = DatagramSocket(null).apply {
          reuseAddress = true
          broadcast = true
          bind(InetSocketAddress(port))
        }
        signalingSocket = s

        val buffer = ByteArray(4096)
        while (isListening && !s.isClosed) {
          try {
            val packet = DatagramPacket(buffer, buffer.size)
            s.receive(packet)
            val message = String(packet.data, 0, packet.length, Charsets.UTF_8)
            val senderIp = packet.address?.hostAddress ?: ""

            this@LocalMeshModule.sendEvent("onMessage", mapOf(
              "message" to message,
              "senderIp" to senderIp
            ))
          } catch (e: Exception) {
            if (!isListening) break
          }
        }
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
  }

  private fun stopListening() {
    isListening = false
    try {
      signalingSocket?.close()
    } catch (e: Exception) {}
    signalingSocket = null

    try {
      signalingListenThread?.interrupt()
    } catch (e: Exception) {}
    signalingListenThread = null

    releaseMulticastLock()
  }

  private fun broadcastMessage(message: String, port: Int) {
    thread(isDaemon = true) {
      val sendSocket = DatagramSocket().apply { broadcast = true }
      try {
        val data = message.toByteArray(Charsets.UTF_8)
        val targets = getBroadcastAddresses()
        for (target in targets) {
          try {
            val packet = DatagramPacket(data, data.size, target, port)
            sendSocket.send(packet)
          } catch (e: Exception) {}
        }
      } catch (e: Exception) {
        e.printStackTrace()
      } finally {
        try { sendSocket.close() } catch (e: Exception) {}
      }
    }
  }

  private fun directMessage(targetIp: String, port: Int, message: String) {
    thread(isDaemon = true) {
      val sendSocket = DatagramSocket()
      try {
        val data = message.toByteArray(Charsets.UTF_8)
        val target = InetAddress.getByName(targetIp)
        val packet = DatagramPacket(data, data.size, target, port)
        sendSocket.send(packet)
      } catch (e: Exception) {
        e.printStackTrace()
      } finally {
        try { sendSocket.close() } catch (e: Exception) {}
      }
    }
  }

  // =========================================================================
  // Ultra-Low Latency UDP Audio Engine (Port 8889) with Sequence Deduplication
  // =========================================================================

  private fun startAudioReceiverInternal(channelCode: String, port: Int) {
    if (isAudioReceiving) {
      currentAudioChannel = channelCode
      return
    }

    currentAudioChannel = channelCode
    isAudioReceiving = true

    acquireMulticastLock()
    setSpeakerphoneInternal(true)

    try {
      // 1. Initialize AudioTrack for direct LOUDSPEAKER output
      val minTrackBuf = AudioTrack.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      ).coerceAtLeast(BYTES_PER_FRAME * 6)

      val track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        )
        .setBufferSizeInBytes(minTrackBuf)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()

      track.setVolume(1.0f)
      track.play()
      audioTrack = track
      Log.i(TAG, "AudioTrack started for LOUDSPEAKER on channel $channelCode at $SAMPLE_RATE Hz")

      // 2. Open UDP Audio Socket with reuseAddress enabled
      val s = DatagramSocket(null).apply {
        reuseAddress = true
        broadcast = true
        bind(InetSocketAddress(port))
      }
      audioSocket = s
      Log.i(TAG, "AudioReceiver bound to port $port")

      // 3. Background Audio Receiver Thread with Sequence Deduplication
      audioListenThread = thread(isDaemon = true, name = "LocalMeshAudioReceiver") {
        val recvBuffer = ByteArray(2048)
        var lastIncomingTime = 0L
        var packetCount = 0
        // Deduplication map: tracks recently played sequence numbers per senderHash
        val recentSeqMap = mutableMapOf<Int, LinkedHashSet<Short>>()

        while (isAudioReceiving && !s.isClosed) {
          try {
            val packet = DatagramPacket(recvBuffer, recvBuffer.size)
            s.receive(packet)

            if (packet.length < HEADER_SIZE) continue
            if (recvBuffer[0] != MAGIC_0 || recvBuffer[1] != MAGIC_1) continue

            val hBuf = ByteBuffer.wrap(recvBuffer, 4, 10).order(ByteOrder.BIG_ENDIAN)
            val packetChanHash = hBuf.int
            val packetSenderHash = hBuf.int
            val packetSeq = hBuf.short

            // Must match current channel
            if (packetChanHash != currentAudioChannel.hashCode()) continue

            // Don't play own audio echo while transmitting
            if (isAudioTransmitting && packetSenderHash == mySenderHash) continue

            // DEDUPLICATION: Drop duplicate packets caused by multi-path broadcast + unicast
            val seqSet = recentSeqMap.getOrPut(packetSenderHash) { LinkedHashSet() }
            if (seqSet.contains(packetSeq)) {
              // Duplicate packet from secondary network path - DROP IMMEDIATELY
              continue
            }
            seqSet.add(packetSeq)
            if (seqSet.size > 120) { // Keep last ~2.4 seconds history
              val it = seqSet.iterator()
              if (it.hasNext()) {
                it.next()
                it.remove()
              }
            }

            val payloadLen = packet.length - HEADER_SIZE
            if (payloadLen <= 0) continue

            val now = System.currentTimeMillis()
            if (now - lastIncomingTime > 400) {
              val senderIp = packet.address?.hostAddress ?: ""
              this@LocalMeshModule.sendEvent("onAudioStateChanged", mapOf(
                "state" to "receiving",
                "senderIp" to senderIp
              ))
            }
            lastIncomingTime = now

            val currentTrack = audioTrack
            if (currentTrack != null && currentTrack.playState == AudioTrack.PLAYSTATE_PLAYING) {
              currentTrack.write(recvBuffer, HEADER_SIZE, payloadLen)
              packetCount++
              if (packetCount % 50 == 1) {
                Log.d(TAG, "Playing deduplicated audio packet #$packetCount (seq=$packetSeq, len=$payloadLen) from ${packet.address?.hostAddress}")
              }
            }
          } catch (e: Exception) {
            if (!isAudioReceiving) break
          }
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start AudioReceiver", e)
      isAudioReceiving = false
    }
  }

  private fun stopAudioReceiverInternal() {
    isAudioReceiving = false

    try {
      audioSocket?.close()
    } catch (e: Exception) {}
    audioSocket = null

    try {
      audioListenThread?.interrupt()
    } catch (e: Exception) {}
    audioListenThread = null

    try {
      audioTrack?.stop()
      audioTrack?.release()
    } catch (e: Exception) {}
    audioTrack = null

    setSpeakerphoneInternal(false)
  }

  private fun startTransmittingAudioInternal(channelCode: String, port: Int, myDeviceId: String, peerIps: List<String>) {
    if (isAudioTransmitting) return

    currentAudioChannel = channelCode
    mySenderHash = myDeviceId.hashCode()
    isAudioTransmitting = true

    if (peerIps.isNotEmpty()) {
      activePeerIps = (activePeerIps + peerIps).filter { it.isNotBlank() }.distinct()
    }

    try {
      // 1. Initialize AudioRecord (VOICE_COMMUNICATION with MIC fallback)
      val minRecordBuf = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      ).coerceAtLeast(BYTES_PER_FRAME * 4)

      var record: AudioRecord? = null
      val sources = intArrayOf(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        MediaRecorder.AudioSource.MIC
      )
      for (source in sources) {
        try {
          val rec = AudioRecord(
            source,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            minRecordBuf
          )
          if (rec.state == AudioRecord.STATE_INITIALIZED) {
            record = rec
            break
          } else {
            rec.release()
          }
        } catch (e: Exception) {}
      }

      if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
        Log.e(TAG, "AudioRecord failed to initialize")
        isAudioTransmitting = false
        return
      }

      record.startRecording()
      audioRecord = record

      // 2. Audio Recording & Transmission Thread
      audioRecordThread = thread(isDaemon = true, name = "LocalMeshAudioSender") {
        val pcmBuffer = ShortArray(SAMPLES_PER_FRAME)
        val byteBuf = ByteBuffer.allocate(BYTES_PER_FRAME).order(ByteOrder.LITTLE_ENDIAN)
        val packetBuffer = ByteArray(HEADER_SIZE + BYTES_PER_FRAME)
        var seq: Short = 0

        // Smart Target Routing: If peers are known, send ONLY unicast directly to those peers!
        // Fall back to broadcast ONLY if no peers have been discovered yet.
        val finalTargets = if (activePeerIps.isNotEmpty()) {
          activePeerIps.mapNotNull { ip ->
            try { InetAddress.getByName(ip) } catch (e: Exception) { null }
          }.distinct()
        } else {
          getBroadcastAddresses().distinct()
        }

        Log.i(TAG, "LocalMeshAudioSender transmitting to targets: ${finalTargets.map { it.hostAddress }} (unicastOnly=${activePeerIps.isNotEmpty()})")

        val sendSocket = DatagramSocket().apply { broadcast = true }
        val chanHash = channelCode.hashCode()
        var packetCount = 0

        try {
          while (isAudioTransmitting && record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            val read = record.read(pcmBuffer, 0, SAMPLES_PER_FRAME)
            if (read <= 0) continue

            byteBuf.clear()
            for (i in 0 until read) {
              byteBuf.putShort(pcmBuffer[i])
            }
            val pcmBytes = byteBuf.array()
            val pcmLen = read * 2

            val totalSize = HEADER_SIZE + pcmLen
            packetBuffer[0] = MAGIC_0
            packetBuffer[1] = MAGIC_1
            packetBuffer[2] = CODEC_PCM
            packetBuffer[3] = 0.toByte()

            val hBuf = ByteBuffer.wrap(packetBuffer, 4, 10).order(ByteOrder.BIG_ENDIAN)
            hBuf.putInt(chanHash)
            hBuf.putInt(mySenderHash)
            hBuf.putShort(seq++)

            System.arraycopy(pcmBytes, 0, packetBuffer, HEADER_SIZE, pcmLen)

            for (target in finalTargets) {
              try {
                val dgram = DatagramPacket(packetBuffer, totalSize, target, port)
                sendSocket.send(dgram)
              } catch (e: Exception) {}
            }

            packetCount++
            if (packetCount % 50 == 1) {
              Log.d(TAG, "Sent audio packet #$packetCount (seq=${seq - 1}, $totalSize bytes) to ${finalTargets.size} targets")
            }
          }
        } catch (e: Exception) {
          Log.e(TAG, "AudioSender error", e)
        } finally {
          try { sendSocket.close() } catch (e: Exception) {}
        }
      }

      this@LocalMeshModule.sendEvent("onAudioStateChanged", mapOf("state" to "transmitting"))
    } catch (e: Exception) {
      Log.e(TAG, "Error starting transmitter", e)
      isAudioTransmitting = false
    }
  }

  private fun stopTransmittingAudioInternal() {
    isAudioTransmitting = false

    try {
      audioRecord?.stop()
      audioRecord?.release()
    } catch (e: Exception) {}
    audioRecord = null

    try {
      audioRecordThread?.interrupt()
    } catch (e: Exception) {}
    audioRecordThread = null

    this@LocalMeshModule.sendEvent("onAudioStateChanged", mapOf("state" to "idle"))
  }

  private fun setSpeakerphoneInternal(enabled: Boolean) {
    try {
      val context = appContext.reactContext
      if (context != null) {
        val am = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        am?.let { audioManager ->
          if (enabled) {
            audioManager.mode = AudioManager.MODE_NORMAL
            audioManager.isSpeakerphoneOn = true
          } else {
            audioManager.isSpeakerphoneOn = false
          }
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  // =========================================================================
  // Network & System Helpers
  // =========================================================================

  private fun acquireMulticastLock() {
    try {
      if (multicastLock == null) {
        val context = appContext.reactContext
        if (context != null) {
          val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
          multicastLock = wifiManager?.createMulticastLock("truetalkie_multicast")?.apply {
            setReferenceCounted(true)
            acquire()
          }
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  private fun releaseMulticastLock() {
    try {
      if (multicastLock?.isHeld == true) {
        multicastLock?.release()
      }
    } catch (e: Exception) {}
    multicastLock = null
  }

  private fun getGatewayIp(): InetAddress? {
    try {
      val context = appContext.reactContext ?: return null
      val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return null
      val activeNetwork = cm.activeNetwork ?: return null
      val linkProperties = cm.getLinkProperties(activeNetwork) ?: return null
      for (route in linkProperties.routes) {
        if (route.hasGateway()) {
          val gw = route.gateway
          if (gw != null && gw.hostAddress != "0.0.0.0") {
            return gw
          }
        }
      }
    } catch (e: Exception) {}
    return null
  }

  private fun getBroadcastAddresses(): List<InetAddress> {
    val broadcastList = mutableListOf<InetAddress>()
    try {
      broadcastList.add(InetAddress.getByName("255.255.255.255"))

      getGatewayIp()?.let { gw ->
        broadcastList.add(gw)
      }

      val interfaces = NetworkInterface.getNetworkInterfaces()
      while (interfaces.hasMoreElements()) {
        val networkInterface = interfaces.nextElement()
        if (networkInterface.isLoopback || !networkInterface.isUp) continue
        for (interfaceAddress in networkInterface.interfaceAddresses) {
          val broadcast = interfaceAddress.broadcast
          if (broadcast != null) {
            broadcastList.add(broadcast)
          }

          val addr = interfaceAddress.address
          if (addr is java.net.Inet4Address && !addr.isLoopbackAddress) {
            val ipParts = addr.hostAddress?.split(".") ?: emptyList()
            if (ipParts.size == 4) {
              try {
                broadcastList.add(InetAddress.getByName("${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.255"))
              } catch (e: Exception) {}
            }
          }
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
    return broadcastList.distinct()
  }

  private fun findLocalIpAddress(): String? {
    try {
      val interfaces = NetworkInterface.getNetworkInterfaces()
      while (interfaces.hasMoreElements()) {
        val networkInterface = interfaces.nextElement()
        if (networkInterface.isLoopback || !networkInterface.isUp) continue
        val addresses = networkInterface.inetAddresses
        while (addresses.hasMoreElements()) {
          val addr = addresses.nextElement()
          if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
            return addr.hostAddress
          }
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
    return null
  }
}

