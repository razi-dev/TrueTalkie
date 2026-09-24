import 'react-native-get-random-values';
import React, { useState, useEffect } from 'react';
import notifee, { EventType } from '@notifee/react-native';
import { channelService } from './src/services/ChannelService';
import { stopForegroundService } from './src/services/ForegroundService';
import { useChannelStore } from './src/store/channelStore';
import HomeScreen from './src/screens/HomeScreen';
import ChannelScreen from './src/screens/ChannelScreen';

// Handle notification action events (e.g. "Leave Channel" from notification)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'leave') {
    await channelService.leave();
    await stopForegroundService();
  }
});

export default function App() {
  const [screen, setScreen] = useState<'home' | 'channel'>('home');
  const { clearChannel } = useChannelStore();

  // Handle foreground notification events
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'leave') {
        channelService.leave();
        stopForegroundService();
        clearChannel();
        setScreen('home');
      }
    });
    return () => unsub();
  }, []);

  if (screen === 'home') {
    return <HomeScreen onJoined={() => setScreen('channel')} />;
  }

  return (
    <ChannelScreen
      onLeft={() => {
        clearChannel();
        setScreen('home');
      }}
    />
  );
}
