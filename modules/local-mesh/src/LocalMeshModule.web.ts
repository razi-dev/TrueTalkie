import { registerWebModule, NativeModule } from 'expo';
import { LocalMeshEvents } from './LocalMesh.types';

class LocalMeshModule extends NativeModule<LocalMeshEvents> {
  async start(port: number): Promise<void> {}
  async stop(): Promise<void> {}
  async sendBroadcast(message: string, port: number): Promise<void> {}
  async sendDirect(targetIp: string, port: number, message: string): Promise<void> {}
  getLocalIpAddress(): string | null { return null; }
}

export default registerWebModule(LocalMeshModule);
