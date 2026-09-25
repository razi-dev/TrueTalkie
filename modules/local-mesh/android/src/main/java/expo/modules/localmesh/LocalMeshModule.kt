package expo.modules.localmesh

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import kotlin.concurrent.thread

class LocalMeshModule : Module() {
  private var socket: DatagramSocket? = null
  private var listenThread: Thread? = null
  private var multicastLock: WifiManager.MulticastLock? = null
  @Volatile private var isListening = false

  override fun definition() = ModuleDefinition {
    Name("LocalMesh")

    Events("onMessage")

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
  }

  private fun startListening(port: Int) {
    if (isListening) return

    try {
      val context = appContext.reactContext
      if (context != null) {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        multicastLock = wifiManager?.createMulticastLock("truetalkie_multicast")?.apply {
          setReferenceCounted(true)
          acquire()
        }
      }

      val s = DatagramSocket(port).apply {
        broadcast = true
        reuseAddress = true
      }
      socket = s
      isListening = true

      listenThread = thread(isDaemon = true, name = "LocalMeshReceiver") {
        val buffer = ByteArray(65535)
        while (isListening && !s.isClosed) {
          try {
            val packet = DatagramPacket(buffer, buffer.size)
            s.receive(packet)
            val received = String(packet.data, 0, packet.length, Charsets.UTF_8)
            val senderIp = packet.address?.hostAddress ?: ""

            this@LocalMeshModule.sendEvent("onMessage", mapOf(
              "message" to received,
              "senderIp" to senderIp
            ))
          } catch (e: Exception) {
            if (!isListening) break
          }
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  private fun stopListening() {
    isListening = false
    try {
      socket?.close()
    } catch (e: Exception) {}
    socket = null

    try {
      listenThread?.interrupt()
    } catch (e: Exception) {}
    listenThread = null

    try {
      if (multicastLock?.isHeld == true) {
        multicastLock?.release()
      }
    } catch (e: Exception) {}
    multicastLock = null
  }

  private fun getBroadcastAddresses(): List<InetAddress> {
    val broadcastList = mutableListOf<InetAddress>()
    try {
      broadcastList.add(InetAddress.getByName("255.255.255.255"))
      val interfaces = NetworkInterface.getNetworkInterfaces()
      while (interfaces.hasMoreElements()) {
        val networkInterface = interfaces.nextElement()
        if (networkInterface.isLoopback || !networkInterface.isUp) continue
        for (interfaceAddress in networkInterface.interfaceAddresses) {
          val broadcast = interfaceAddress.broadcast
          if (broadcast != null) {
            broadcastList.add(broadcast)
          }
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
    return broadcastList.distinct()
  }

  private fun broadcastMessage(message: String, port: Int) {
    thread(isDaemon = true) {
      try {
        val data = message.toByteArray(Charsets.UTF_8)
        val targets = getBroadcastAddresses()
        val sendSocket = socket ?: DatagramSocket()
        sendSocket.broadcast = true
        for (target in targets) {
          try {
            val packet = DatagramPacket(data, data.size, target, port)
            sendSocket.send(packet)
          } catch (e: Exception) {
            // ignore failure on individual interface
          }
        }
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
  }

  private fun directMessage(targetIp: String, port: Int, message: String) {
    thread(isDaemon = true) {
      try {
        val data = message.toByteArray(Charsets.UTF_8)
        val target = InetAddress.getByName(targetIp)
        val sendSocket = socket ?: DatagramSocket()
        val packet = DatagramPacket(data, data.size, target, port)
        sendSocket.send(packet)
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
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
