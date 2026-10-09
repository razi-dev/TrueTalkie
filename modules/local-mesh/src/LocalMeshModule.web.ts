import { registerWebModule, NativeModule } from 'expo';
import { LocalMeshEvents } from './LocalMesh.types';

class LocalMeshModule extends NativeModule<LocalMeshEvents> {
  async start(port: number): Promise<void> {}
  async stop(): Promise<void> {}
  async sendBroadcast(message: string, port: number): Promise<void> {}
  async sendDirect(targetIp: string, port: number, message: string): Promise<void> {}
  getLocalIpAddress(): string | null { return null; }
  async startAudioReceiver(channelCode: string, port?: number): Promise<void> {}
  async stopAudioReceiver(): Promise<void> {}
  async startTransmittingAudio(channelCode: string, port?: number, myDeviceId?: string): Promise<void> {}
  async stopTransmittingAudio(): Promise<void> {}
  async setSpeakerphone(enabled: boolean): Promise<void> {}
}

export default registerWebModule(LocalMeshModule, 'LocalMesh');