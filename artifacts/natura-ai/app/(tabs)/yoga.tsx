import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { yogaPoses } from "../../data/poses";

const { width } = Dimensions.get("window");
const CARD_W = (width - spacing.md * 2 - 12) / 2;

const diffColor = { Beginner: colors.primary, Intermediate: colors.accent };

export default function YogaScreen() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Beginner" | "Intermediate">("All");

  const filtered = yogaPoses.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "All" || p.difficulty === filter;
    return matchSearch && matchFilter;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Yoga Poses</Text>
          <Text style={styles.subtitle}>{yogaPoses.length} poses · tap to explore</Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={colors.textDim} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search poses…"
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {(["All", "Beginner", "Intermediate"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Grid */}
        <View style={styles.grid}>
          {filtered.map((pose) => (
            <TouchableOpacity
              key={pose.id}
              style={styles.card}
              onPress={() => router.push(`/pose/${pose.id}` as any)}
              activeOpacity={0.88}
            >
              <Image
                source={pose.image as any}
                style={styles.cardImage}
                resizeMode="cover"
              />
              <View style={styles.cardOverlay} />
              <View style={styles.cardBadge}>
                <Text style={[styles.cardBadgeText, { color: diffColor[pose.difficulty] }]}>
                  {pose.difficulty}
                </Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={2}>{pose.name}</Text>
                <View style={styles.cardMeta}>
                  <Feather name="clock" size={10} color={colors.textDim} />
                  <Text style={styles.cardDur}>{pose.duration}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Feather name="search" size={32} color={colors.textDim} />
            <Text style={styles.emptyText}>No poses match your search</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontFamily: "Inter_700Bold",
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.text,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: 8,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: fontSizes.xs,
    fontFamily: "Inter_600SemiBold",
    color: colors.textMuted,
  },
  filterTextActive: {
    color: "#fff",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  card: {
    width: CARD_W,
    height: CARD_W * 1.2,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,25,16,0.55)",
  },
  cardBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(13,31,22,0.75)",
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  cardBody: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  cardName: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 4,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardDur: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: colors.textMuted,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: fontSizes.sm,
    fontFamily: "Inter_400Regular",
    color: colors.textDim,
  },
});
