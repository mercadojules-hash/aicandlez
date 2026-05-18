import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Platform, View, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "@/constants/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const isIOS  = Platform.OS === "ios";
  const isWeb  = Platform.OS === "web";
  const tabH   = 54;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   C.brand,
        tabBarInactiveTintColor: C.textDim,
        tabBarStyle: {
          position:        "absolute",
          backgroundColor: isIOS ? "transparent" : "#050A07",
          borderTopWidth:  1,
          borderTopColor:  C.borderHi,
          height:          tabH + (isWeb ? 34 : insets.bottom),
          paddingBottom:   isWeb ? 34 : insets.bottom,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.6,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.surface }]} />
          ) : null,
      }}
    >
      <Tabs.Screen name="index"   options={{ title: "Home",    tabBarIcon: ({ color, size }) => <Feather name="activity"    size={size - 2} color={color} /> }} />
      <Tabs.Screen name="trade"   options={{ title: "Trade",   tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="markets" options={{ title: "Markets", tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="user"        size={size - 2} color={color} /> }} />

      {/* Hide terminal from nav — file stays for deep-link access only */}
      <Tabs.Screen name="terminal" options={{ href: null }} />
    </Tabs>
  );
}
