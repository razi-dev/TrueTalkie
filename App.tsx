import "react-native-get-random-values";
import React, { useState, useEffect } from "react";
import { channelService } from "./src/services/ChannelService";
import { stopForegroundService } from "./src/services/ForegroundService";
import { useChannelStore } from "./src/store/channelStore";
import HomeScreen from "./src/screens/HomeScreen";
import ChannelScreen from "./src/screens/ChannelScreen";

export default function App() {
  const [screen, setScreen] = useState<"home" | "channel">("home");
  const { clearChannel } = useChannelStore();

  return screen === "home" ? (
    <HomeScreen onJoined={() => setScreen("channel")} />
  ) : (
    <ChannelScreen
      onLeft={() => {
        channelService.leave();
        stopForegroundService();
        clearChannel();
        setScreen("home");
      }}
    />
  );
}
