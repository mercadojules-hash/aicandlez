import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { useWellness } from "../../contexts/WellnessContext";
import { RECIPES } from "../../data/wellness";
import { fontSizes, radii, spacing } from "../../constants/theme";

type Tab = "Recipes" | "Grocery List";

const FILTERS = ["All", "immunity", "energy", "stress", "sleep", "digestion"] as const;
type Filter = typeof FILTERS[number];

const GOAL_COLORS: Record<string, string> = {
  immunity:  "#4CAF7D",
  energy:    "#9FE870",
  stress:    "#F5A623",
  sleep:     "#8B7FD4",
  digestion: "#45B7AA",
};

const FREE_RECIPE_IDS = new Set([
  "recipe-golden-milk",
  "recipe-immunity-broth",
  "recipe-energy-citrus",
  "recipe-stress-chamomile",
  "recipe-sleep-chamomile",
  "recipe-digestion-ginger",
  "recipe-digestion-peppermint",
]);

const RECIPE_IMAGES: Record<string, any> = {
  "recipe-golden-milk":      require("../../assets/images/tea-recipe.png"),
  "recipe-immunity-broth":   require("../../assets/images/herbs-hero.png"),
  "recipe-sleep-banana":     require("../../assets/images/recipe-bowl.png"),
};

export default function RecipesScreen() {
  const { colors } = useTheme();
  const { isPremium, openPaywall } = useSubscription();
  const { saveItem, removeItem, isSaved, addToGrocery, groceryList, toggleGroceryItem, clearGroceryChecked } = useWellness();
  const [activeTab, setActiveTab] = useState<Tab>("Recipes");
  const [filter, setFilter] = useState<Filter>("All");

  const filtered = filter === "All" ? RECIPES : RECIPES.filter((r) => r.goal === filter);
  const uncheckedCount = groceryList.filter((g) => !g.checked).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Recipes</Text>
        <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(["Recipes", "Grocery List"] as Tab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && { backgroundColor: colors.primary + "22" }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textMuted }]}>
                {tab}{tab === "Grocery List" && groceryList.length > 0 ? ` (${uncheckedCount})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === "Recipes" && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 10 }}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border }]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, { color: filter === f ? "#0D1F16" : colors.textMuted }]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}>
            {filtered.map((recipe) => {
              const saved     = isSaved(recipe.id);
              const isLocked  = !isPremium && !FREE_RECIPE_IDS.has(recipe.id);
              const goalColor = GOAL_COLORS[recipe.goal] ?? colors.primary;
              const img       = RECIPE_IMAGES[recipe.id];
              return (
                <TouchableOpacity
                  key={recipe.id}
                  style={[styles.recipeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => isLocked && openPaywall()}
                  activeOpacity={isLocked ? 0.85 : 1}
                >
                  {/* Hero image area */}
                  <View style={[styles.recipeHero, { backgroundColor: goalColor + "22" }]}>
                    {img && <Image source={img} style={styles.recipeImg} />}
                    {!img && <Feather name="droplet" size={32} color={goalColor} />}
                    {isLocked && (
                      <View style={styles.lockedOverlay}>
                        <View style={[styles.lockedBadge, { backgroundColor: "#0D1F16CC" }]}>
                          <Feather name="lock" size={14} color={colors.primary} />
                          <Text style={[styles.lockedText, { color: colors.primary }]}>Premium Recipe</Text>
                        </View>
                      </View>
                    )}
                    {/* Top actions */}
                    <View style={styles.heroActions}>
                      <TouchableOpacity style={[styles.heroBtn, { backgroundColor: "#00000066" }]} onPress={() => addToGrocery(recipe.groceryList)}>
                        <Feather name="shopping-cart" size={14} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.heroBtn, { backgroundColor: "#00000066" }]} onPress={() => saved ? removeItem(recipe.id) : saveItem({ id: recipe.id, type: "recipe", title: recipe.title, savedAt: new Date().toISOString() })}>
                        <Feather name="bookmark" size={14} color={saved ? colors.primary : "#fff"} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Body */}
                  <View style={styles.recipeBody}>
                    <View style={styles.recipeMeta}>
                      <Text style={[styles.recipeTime, { color: colors.textMuted }]}>⏱ {recipe.prepTime}</Text>
                      <View style={[styles.goalPill, { backgroundColor: goalColor + "22" }]}>
                        <Text style={[styles.goalPillText, { color: goalColor }]}>{recipe.goal}</Text>
                      </View>
                    </View>
                    <Text style={[styles.recipeTitle, { color: colors.text }]}>{recipe.title}</Text>
                    <Text style={[styles.recipeDesc, { color: colors.textDim }]}>{recipe.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 24 }} />
          </ScrollView>
        </>
      )}

      {activeTab === "Grocery List" && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ padding: spacing.md }}>
          {groceryList.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="shopping-cart" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Your list is empty</Text>
              <Text style={[styles.emptySub, { color: colors.textDim }]}>Add ingredients from any recipe</Text>
            </View>
          ) : (
            <>
              {groceryList.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.groceryItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => toggleGroceryItem(item.id)}
                >
                  <View style={[styles.checkbox, { backgroundColor: item.checked ? colors.primary : "transparent", borderColor: item.checked ? colors.primary : colors.border }]}>
                    {item.checked && <Feather name="check" size={12} color="#0D1F16" />}
                  </View>
                  <Text style={[styles.groceryName, { color: item.checked ? colors.textMuted : colors.text, textDecorationLine: item.checked ? "line-through" : "none" }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {groceryList.some((g) => g.checked) && (
                <TouchableOpacity style={[styles.clearBtn, { borderColor: colors.border }]} onPress={clearGroceryChecked}>
                  <Feather name="trash-2" size={14} color="#E53E3E" />
                  <Text style={[styles.clearText, { color: "#E53E3E" }]}>Clear checked</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  scroll:        { flex: 1 },
  header:        { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  pageTitle:     { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold", marginBottom: spacing.sm },
  tabs:          { flexDirection: "row", borderRadius: radii.md, borderWidth: 1, overflow: "hidden" },
  tab:           { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
  tabText:       { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  filterScroll:  { flexGrow: 0 },
  filterChip:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radii.full, borderWidth: 1, marginRight: 8 },
  filterText:    { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  recipeCard:    { borderRadius: radii.lg, borderWidth: 1, overflow: "hidden", marginBottom: spacing.md },
  recipeHero:    { height: 160, alignItems: "center", justifyContent: "center", position: "relative" },
  recipeImg:     { width: "100%", height: "100%", resizeMode: "cover", position: "absolute" },
  lockedOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" },
  lockedBadge:   { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10 },
  lockedText:    { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold" },
  heroActions:   { position: "absolute", top: spacing.sm, right: spacing.sm, flexDirection: "row", gap: 6 },
  heroBtn:       { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  recipeBody:    { padding: spacing.md },
  recipeMeta:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  recipeTime:    { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular" },
  goalPill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  goalPillText:  { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  recipeTitle:   { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  recipeDesc:    { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", lineHeight: 18 },
  empty:         { alignItems: "center", paddingVertical: 60 },
  emptyTitle:    { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", marginTop: spacing.md, marginBottom: 4 },
  emptySub:      { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  groceryItem:   { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  groceryName:   { flex: 1, fontSize: fontSizes.sm, fontFamily: "Inter_400Regular" },
  clearBtn:      { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.sm, justifyContent: "center" },
  clearText:     { fontSize: fontSizes.sm, fontFamily: "Inter_500Medium" },
});
