import { NativeModule, requireNativeModule } from 'expo';
import { LocalMeshEvents } from './LocalMesh.types';

declare class LocalMeshNativeModule extends NativeModule<LocalMeshEvents> {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  sendBroadcast(message: string, port: number): Promise<void>;
  sendDirect(targetIp: string, port: number, message: string): Promise<void>;
  getLocalIpAddress(): string | null;
  startAudioReceiver(channelCode: string, port?: number): Promise<void>;
  stopAudioReceiver(): Promise<void>;
  startTransmittingAudio(channelCode: string, port?: number, myDeviceId?: string, peerIps?: string[]): Promise<void>;
  stopTransmittingAudio(): Promise<void>;
  updatePeerIps(ips: string[]): Promise<void>;
  setSpeakerphone(enabled: boolean): Promise<void>;
}

export default requireNativeModule<LocalMeshNativeModule>('LocalMesh');
