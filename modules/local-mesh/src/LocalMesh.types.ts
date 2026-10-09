export type LocalMeshEvents = {
  onMessage: (event: { message: string; senderIp: string }) => void;
  onAudioStateChanged: (event: { state: string; senderIp?: string }) => void;
};
