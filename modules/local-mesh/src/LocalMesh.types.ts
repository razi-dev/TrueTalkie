export interface LocalMeshMessageEvent {
  message: string;
  senderIp: string;
}

export type LocalMeshEvents = {
  onMessage: (event: LocalMeshMessageEvent) => void;
};
