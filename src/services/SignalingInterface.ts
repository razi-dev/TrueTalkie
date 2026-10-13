// src/services/SignalingInterface.ts

export type SignalType = 'offer' | 'answer' | 'ice-candidate' | 'ptt';

export interface SignalMessage {
  type: SignalType;
  payload: any;
  from_device: string;
  to_device?: string;
}

export type OnSignalCallback = (msg: SignalMessage) => void;

export interface ISignalingService {
  subscribe(): Promise<void>;
  send(type: SignalType, payload: any, toDevice?: string): Promise<void>;
  unsubscribe(): Promise<void>;
}

