import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { spacing, radius, fontSizes } from "../constants/theme";
import { useTheme, ThemeOverride } from "../contexts/ThemeContext";
import { useUser } from "../contexts/UserContext";
import { useSoundPreference } from "../hooks/useSoundPreference";
import { NaturaLogo } from "../components/NaturaLogo";

const THEME_OPTIONS: { label: string; icon: string; value: ThemeOverride }[] = [
  { label: "Dark", icon: "moon", value: "dark" },
  { label: "Light", icon: "sun", value: "light" },
  { label: "Auto", icon: "monitor", value: "system" },
];

export default function ProfileScreen() {
  const { colors, override, setOverride } = useTheme();
  const { profile, updateProfile } = useUser();
  const { soundEnabled, setSoundEnabled } = useSoundPreference();
  const [name, setName] = useState(profile.name || "");
  const [nameSaved, setNameSaved] = useState(false);

  const pickImage = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow photo library access.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        await updateProfile({ image: result.assets[0].uri });
      }
    } catch {}
  };

  const saveName = async () => {
    await updateProfile({ name: name.trim() });
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={18} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={styles.avatarOuter}>
            {profile.image ? (
              <Image source={{ uri: profile.image }} style={styles.avatarImg} />
            ) : (
              <LinearGradient
                colors={[colors.primary + "60", colors.primary + "28"]}
                style={styles.avatarPlaceholder}
              >
                <NaturaLogo size={48} />
              </LinearGradient>
            )}
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: colors.textMuted }]}>Tap to change photo</Text>
        </View>

        <View style={styles.body}>
          {/* Name */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Display Name</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.nameInput, { color: colors.text, borderColor: colors.border }]}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textDim}
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <TouchableOpacity
                onPress={saveName}
                style={[styles.saveBtn, { backgroundColor: nameSaved ? colors.success : colors.primary }]}
              >
                <Feather name={nameSaved ? "check" : "save"} size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Theme */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Appearance</Text>
            <View style={styles.themeRow}>
              {THEME_OPTIONS.map((opt) => {
                const active = override === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setOverride(opt.value)}
                    style={[
                      styles.themeBtn,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + "20" : colors.cardAlt,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={opt.icon as any}
                      size={16}
                      color={active ? colors.primary : colors.textDim}
                    />
                    <Text
                      style={[
                        styles.themeBtnLabel,
                        { color: active ? colors.primary : colors.textDim },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Sound */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Sound</Text>
            <View style={styles.soundRow}>
              <View style={styles.soundInfo}>
                <Feather name="volume-2" size={18} color={colors.primary} />
                <View>
                  <Text style={[styles.soundTitle, { color: colors.text }]}>Breathing Audio</Text>
                  <Text style={[styles.soundSub, { color: colors.textMuted }]}>
                    Synthesized sound guidance during sessions
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setSoundEnabled(!soundEnabled)}
                style={[
                  styles.toggle,
                  {
                    backgroundColor: soundEnabled ? colors.primary : colors.cardAlt,
                    borderColor: soundEnabled ? colors.primary : colors.border,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.toggleThumb,
                    { transform: [{ translateX: soundEnabled ? 20 : 2 }] },
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* App info */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NaturaLogo size={32} />
            <View>
              <Text style={[styles.infoTitle, { color: colors.text }]}>Natura Yoga AI</Text>
              <Text style={[styles.infoVersion, { color: colors.textDim }]}>Version 1.0.0</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold" },
  avatarSection: { alignItems: "center", paddingVertical: 28 },
  avatarOuter: { width: 96, height: 96, borderRadius: 48, overflow: "hidden", marginBottom: 10 },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarEditBadge: {
    position: "absolute", bottom: 4, right: 4,
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  avatarHint: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  body: { paddingHorizontal: spacing.md, gap: 14 },
  section: {
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.md,
  },
  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_500Medium",
    letterSpacing: 1, marginBottom: 12, textTransform: "uppercase",
  },
  nameRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  nameInput: {
    flex: 1, borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: fontSizes.md, fontFamily: "Inter_400Regular",
  },
  saveBtn: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center",
  },
  themeRow: { flexDirection: "row", gap: 8 },
  themeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: 11,
  },
  themeBtnLabel: { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold" },
  soundRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  soundInfo: { flexDirection: "row", alignItems: "flex-start", gap: 12, flex: 1 },
  soundTitle: { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium", marginBottom: 3 },
  soundSub: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, maxWidth: 200 },
  toggle: {
    width: 46, height: 26, borderRadius: 13, borderWidth: 1.5,
    justifyContent: "center", marginLeft: 8,
  },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff",
  },
  infoCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.md,
  },
  infoTitle: { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold" },
  infoVersion: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});
