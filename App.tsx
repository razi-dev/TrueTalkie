import "react-native-get-random-values";
import React, { useState } from "react";
import { View, ActivityIndicator } from "react-native";
import {
  useFonts,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from "@expo-google-fonts/fredoka";
import { channelService } from "./src/services/ChannelService";
import { stopForegroundService } from "./src/services/ForegroundService";
import { useChannelStore } from "./src/store/channelStore";
import HomeScreen from "./src/screens/HomeScreen";
import ChannelScreen from "./src/screens/ChannelScreen";

export default function App() {
  const [screen, setScreen] = useState<"home" | "channel">("home");
  const { clearChannel } = useChannelStore();

  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0F1D", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00F5A0" />
      </View>
    );
  }

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
