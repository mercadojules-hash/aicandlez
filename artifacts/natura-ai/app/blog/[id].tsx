import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
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
import { BLOG_POSTS } from "@/lib/blogData";


const FALLBACK_IMG = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=500&fit=crop";

export default function BlogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { saveItem, removeItem, isSaved } = useWellness();

  const post = BLOG_POSTS.find((p) => p.id === id);

  if (!post) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
          Post not found.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingBottom: Platform.OS === "web" ? 48 : insets.bottom + 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero image */}
      <View style={styles.heroWrapper}>
        {Platform.OS === "web" ? (
          // @ts-ignore
          <img
            src={post.image}
            alt={post.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e: any) => { e.currentTarget.src = FALLBACK_IMG; }}
          />
        ) : (
          <Image
            source={{ uri: post.image }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="none"
          />
        )}

        {/* Gradient overlay at bottom of image */}
        <View style={styles.heroGradient} />

        {/* Back button */}
        <TouchableOpacity
          style={[
            styles.backBtn,
            { top: Platform.OS === "web" ? 20 : insets.top + 8 },
          ]}
          onPress={() => router.back()}
          hitSlop={{ top: 12, left: 12, right: 12, bottom: 12 }}
        >
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Save button */}
        <TouchableOpacity
          style={[
            styles.saveBtn,
            { top: Platform.OS === "web" ? 20 : insets.top + 8 },
          ]}
          onPress={() => {
            if (isSaved(post.id)) {
              removeItem(post.id);
            } else {
              saveItem({ id: post.id, type: "blog", title: post.title, savedAt: new Date().toISOString() });
            }
          }}
          hitSlop={{ top: 12, left: 12, right: 12, bottom: 12 }}
        >
          <Feather name="bookmark" size={20} color={isSaved(post.id) ? "#6DB86D" : "#fff"} />
        </TouchableOpacity>
      </View>

      {/* Article content */}
      <View style={styles.content}>
        {/* Category + meta */}
        <View style={styles.metaRow}>
          <View
            style={[
              styles.categoryPill,
              { backgroundColor: post.categoryBg },
            ]}
          >
            <Text
              style={[
                styles.categoryText,
                { color: post.categoryText, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {post.category}
            </Text>
          </View>
          <View style={styles.metaRight}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text
              style={[
                styles.metaText,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {post.readTime}
            </Text>
            <Text style={{ color: colors.mutedForeground }}>·</Text>
            <Text
              style={[
                styles.metaText,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {post.publishedAt}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text
          style={[
            styles.title,
            { color: colors.foreground, fontFamily: "Inter_700Bold" },
          ]}
        >
          {post.title}
        </Text>

        {/* Excerpt / lead */}
        <View
          style={[
            styles.excerptBlock,
            { borderLeftColor: colors.primary, backgroundColor: colors.muted },
          ]}
        >
          <Text
            style={[
              styles.excerptText,
              { color: colors.foreground, fontFamily: "Inter_500Medium" },
            ]}
          >
            {post.excerpt}
          </Text>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Body paragraphs */}
        {post.content.map((para, i) => (
          <Text
            key={i}
            style={[
              styles.para,
              { color: colors.foreground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {para}
          </Text>
        ))}

        {/* Back link */}
        <TouchableOpacity
          style={[styles.backLink, { borderTopColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text
            style={[
              styles.backLinkText,
              { color: colors.primary, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            Back to Learn
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  heroWrapper: {
    width: "100%",
    height: 300,
    backgroundColor: "#DDE5DD",
    position: "relative",
  },
  heroGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: "transparent",
  },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    position: "absolute",
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
    gap: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  metaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 12,
  },
  title: {
    fontSize: 23,
    lineHeight: 31,
    letterSpacing: -0.4,
  },
  excerptBlock: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  excerptText: {
    fontSize: 15,
    lineHeight: 23,
    fontStyle: "italic",
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  para: {
    fontSize: 15,
    lineHeight: 25,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
  },
  backLinkText: {
    fontSize: 15,
  },
});
