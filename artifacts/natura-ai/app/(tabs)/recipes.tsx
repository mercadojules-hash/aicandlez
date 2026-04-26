import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWellness } from "@/contexts/WellnessContext";
import { RecipeCard } from "@/components/Cards";
import { ChecklistItem } from "@/components/ChecklistItem";
import { RECIPES } from "@/lib/data";

const GOAL_FILTERS = ["All", "stress", "sleep", "energy", "immunity"] as const;

const TABS = ["Recipes", "Grocery List"] as const;
type Tab = (typeof TABS)[number];

export default function RecipesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("Recipes");
  const [filter, setFilter] = useState("All");
  const { saveItem, removeItem, isSaved, addToGrocery, groceryList, toggleGroceryItem, clearGroceryChecked } = useWellness();

  const filtered = filter === "All" ? RECIPES : RECIPES.filter((r) => r.goal === filter);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Recipes
        </Text>
        <View style={[styles.tabs, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tab,
                activeTab === tab && { backgroundColor: colors.card, borderRadius: colors.radius - 6 },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: activeTab === tab ? colors.primary : colors.mutedForeground,
                    fontFamily: activeTab === tab ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {tab}
                {tab === "Grocery List" && groceryList.length > 0 ? ` (${groceryList.filter((g) => !g.checked).length})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === "Recipes" && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.filterScroll, { borderBottomColor: colors.border }]}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 12 }}
          >
            {GOAL_FILTERS.map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => setFilter(g)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filter === g ? colors.primary : colors.card,
                    borderColor: filter === g ? colors.primary : colors.border,
                    borderRadius: 20,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: filter === g ? "#fff" : colors.foreground,
                      fontFamily: "Inter_500Medium",
                    },
                  ]}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <RecipeCard
                recipe={item}
                index={index}
                onPress={() => router.push(`/remedy/${item.id}`)}
                isSaved={isSaved(item.id)}
                onSave={() => {
                  if (isSaved(item.id)) {
                    removeItem(item.id);
                  } else {
                    saveItem({ id: item.id, type: "recipe", title: item.title, savedAt: new Date().toISOString() });
                  }
                }}
                onAddToGrocery={() => addToGrocery(item.groceryList)}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84 },
            ]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="book-open" size={44} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  No results here yet
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Try another category to find your perfect wellness recipe
                </Text>
              </View>
            }
          />
        </>
      )}

      {activeTab === "Grocery List" && (
        <View style={{ flex: 1 }}>
          {groceryList.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="shopping-cart" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Your list is empty
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Tap the cart icon on any recipe to add its ingredients here.
              </Text>
            </View>
          ) : (
            <>
              <FlatList
                data={groceryList}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <ChecklistItem
                    label={item.name}
                    checked={item.checked}
                    onToggle={() => toggleGroceryItem(item.id)}
                  />
                )}
                contentContainerStyle={[
                  styles.groceryContent,
                  { paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84 },
                ]}
                showsVerticalScrollIndicator={false}
              />
              {groceryList.some((g) => g.checked) && (
                <TouchableOpacity
                  onPress={clearGroceryChecked}
                  style={[
                    styles.clearButton,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderRadius: colors.radius - 4,
                      bottom: (Platform.OS === "web" ? 34 : insets.bottom) + 84 + 12,
                    },
                  ]}
                >
                  <Feather name="trash-2" size={14} color={colors.destructive} />
                  <Text style={[styles.clearText, { color: colors.destructive, fontFamily: "Inter_500Medium" }]}>
                    Clear checked
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    marginBottom: 14,
  },
  tabs: {
    flexDirection: "row",
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabText: { fontSize: 14 },
  filterScroll: { borderBottomWidth: 1 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
  },
  filterText: { fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingTop: 16 },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: { fontSize: 18 },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 280,
  },
  groceryContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  clearButton: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1,
    gap: 8,
  },
  clearText: { fontSize: 14 },
});
