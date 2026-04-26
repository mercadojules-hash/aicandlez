import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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
import { BLOG_POSTS, type BlogPost } from "@/lib/blogData";

const ALL_CATEGORIES = [
  "All",
  ...Array.from(new Set(BLOG_POSTS.map((p) => p.category))),
];

function BlogCard({ post }: { post: BlogPost }) {
  const colors = useColors();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/blog/${post.id}` as any)}
      activeOpacity={0.92}
    >
      {/* Hero image */}
      <View style={styles.imageWrapper}>
        {Platform.OS === "web" ? (
          // @ts-ignore
          <img
            src={post.image}
            alt={post.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e: any) => {
              e.currentTarget.src =
                "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&h=500&fit=crop";
            }}
          />
        ) : (
          <Image
            source={{ uri: post.image }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="none"
          />
        )}

        {/* Category pill over image */}
        <View
          style={[
            styles.categoryPill,
            { backgroundColor: post.categoryBg },
          ]}
        >
          <Text style={[styles.categoryText, { color: post.categoryText }]}>
            {post.category}
          </Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardBody}>
        <Text
          style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
          numberOfLines={2}
        >
          {post.title}
        </Text>

        <Text
          style={[styles.cardExcerpt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
          numberOfLines={3}
        >
          {post.excerpt}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.metaRow}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {post.readTime}
            </Text>
            <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {post.publishedAt}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.readMoreBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push(`/blog/${post.id}` as any)}
          >
            <Text style={[styles.readMoreText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Read more
            </Text>
            <Feather name="arrow-right" size={13} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function BlogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered =
    activeCategory === "All"
      ? BLOG_POSTS
      : BLOG_POSTS.filter((p) => p.category === activeCategory);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Learn
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Wellness insights, backed by science
        </Text>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
        >
          {ALL_CATEGORIES.map((cat) => {
            const active = cat === activeCategory;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    {
                      color: active ? colors.primaryForeground : colors.mutedForeground,
                      fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Post list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BlogCard post={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === "web" ? 80 : insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="file-text" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No posts in this category yet.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 14,
  },
  filterScroll: {
    marginHorizontal: -20,
  },
  filterContent: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 8,
    flexDirection: "row",
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  imageWrapper: {
    width: "100%",
    height: 190,
    backgroundColor: "#DDE5DD",
    position: "relative",
  },
  categoryPill: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  cardBody: {
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  cardExcerpt: {
    fontSize: 14,
    lineHeight: 21,
  },
  cardFooter: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 12,
  },
  dot: {
    fontSize: 12,
  },
  readMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  readMoreText: {
    fontSize: 13,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});
