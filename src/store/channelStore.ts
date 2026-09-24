// src/store/channelStore.ts
// Global state using Zustand

import { create } from 'zustand';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Peer {
  deviceId: string;
  name: string;
  isTransmitting: boolean;
}

interface ChannelStore {
  // Identity
  myDeviceId: string;
  myName: string;
  setMyName: (name: string) => void;

  // Channel
  channelCode: string;
  channelId: string | null;
  setChannel: (code: string, id: string) => void;
  clearChannel: () => void;

  // Connection
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;

  // Peers
  peers: Peer[];
  setPeers: (peers: Peer[]) => void;
  upsertPeer: (peer: Peer) => void;
  removePeer: (deviceId: string) => void;

  // PTT
  isTransmitting: boolean;
  setTransmitting: (val: boolean) => void;
  transmittingPeer: string | null;
  setTransmittingPeer: (name: string | null) => void;
}

// Generate a stable device ID for this install
const generateDeviceId = () =>
  'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export const useChannelStore = create<ChannelStore>((set) => ({
  myDeviceId: generateDeviceId(),
  myName: 'Worker',
  setMyName: (name) => set({ myName: name }),

  channelCode: '',
  channelId: null,
  setChannel: (code, id) => set({ channelCode: code, channelId: id }),
  clearChannel: () => set({ channelCode: '', channelId: null, peers: [], status: 'disconnected' }),

  status: 'disconnected',
  setStatus: (status) => set({ status }),

  peers: [],
  setPeers: (peers) => set({ peers }),
  upsertPeer: (peer) =>
    set((state) => {
      const exists = state.peers.find((p) => p.deviceId === peer.deviceId);
      if (exists) {
        return { peers: state.peers.map((p) => (p.deviceId === peer.deviceId ? peer : p)) };
      }
      return { peers: [...state.peers, peer] };
    }),
  removePeer: (deviceId) =>
    set((state) => ({ peers: state.peers.filter((p) => p.deviceId !== deviceId) })),

  isTransmitting: false,
  setTransmitting: (val) => set({ isTransmitting: val }),
  transmittingPeer: null,
  setTransmittingPeer: (name) => set({ transmittingPeer: name }),
}));
