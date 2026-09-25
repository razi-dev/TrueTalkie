import { NativeModule, requireNativeModule } from 'expo';
import { LocalMeshEvents } from './LocalMesh.types';

declare class LocalMeshNativeModule extends NativeModule<LocalMeshEvents> {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  sendBroadcast(message: string, port: number): Promise<void>;
  sendDirect(targetIp: string, port: number, message: string): Promise<void>;
  getLocalIpAddress(): string | null;
}

export default requireNativeModule<LocalMeshNativeModule>('LocalMesh');
