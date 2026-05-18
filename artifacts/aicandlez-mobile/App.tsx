/**
 * AICandlez Mobile — Expo WebView Shell
 *
 * Fastest path to TestFlight: a thin native iOS wrapper that loads the
 * production PWA at PWA_URL. Identical UX to the web app, but runs as a
 * native iOS app with Clerk session cookies, safe-area handling, splash,
 * offline fallback, and gesture navigation.
 *
 * Bundle ID: com.julesmercado.aicandelz
 *
 * Visual system: black + neon green (matches the locked AICandlez brand
 * tokens — #66FF66 / #00C853 / #7CFF00).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import * as SystemUI from "expo-system-ui";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

// ── Configuration ──────────────────────────────────────────────────────────
const PWA_URL = "https://app.aicandelz.com";

// Brand palette (locked — matches aicandlez-app/src/index.css)
const BG         = "#000000";
const SURFACE    = "#050A07";
const BRAND      = "#66FF66";
const BRAND_BRGT = "#7CFF00";
const TEXT       = "#E8F5EC";
const DIM        = "#8A9C94";
const NEG        = "#ff4466";

// Hosts that should load inside the WebView. Everything else (Stripe checkout,
// Apple/Google sign-in popups, external articles, mailto/tel) is delegated to
// the system browser so authentication flows behave correctly and App Store
// reviewers don't see the WebView trying to render arbitrary external sites.
const INTERNAL_HOST_RE = /(^|\.)aicandelz\.com$/i;

// Keep the splash visible until the WebView finishes its first paint.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Match the OS background so the brief flash before React mounts is black.
SystemUI.setBackgroundColorAsync(BG).catch(() => {});

// ───────────────────────────────────────────────────────────────────────────
// MAIN APP
// ───────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" backgroundColor={BG} translucent={false} />
        <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
          <Shell />
        </SafeAreaView>
        {/* Bottom safe-area gets its own solid block so the WebView never
            bleeds under the home indicator on notched iPhones. */}
        <SafeAreaView style={styles.bottomSafe} edges={["bottom"]} />
      </View>
    </SafeAreaProvider>
  );
}

function Shell() {
  const webRef                              = useRef<WebView>(null);
  const [loading, setLoading]               = useState(true);
  const [hardError, setHardError]           = useState<string | null>(null);
  const [online, setOnline]                 = useState(true);
  const fade                                = useRef(new Animated.Value(1)).current;

  // ── Connectivity monitoring ─────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, []);

  // ── Foreground refresh — pulls latest signals when user returns ─────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && online && webRef.current) {
        // Soft-reload via injected JS so we don't re-fire splash.
        webRef.current.injectJavaScript("window.dispatchEvent(new Event('focus')); true;");
      }
    });
    return () => sub.remove();
  }, [online]);

  // ── External-link interception ──────────────────────────────────────────
  const onShouldStartLoad = useCallback((req: ShouldStartLoadRequest) => {
    const url = req.url;
    // Allow about:blank and same-origin navigation.
    if (!url || url === "about:blank") return true;
    if (url.startsWith("data:") || url.startsWith("blob:")) return true;

    try {
      const host = new URL(url).hostname;
      if (INTERNAL_HOST_RE.test(host)) return true;
    } catch {
      return true;
    }

    // mailto / tel / sms / itms-apps / custom schemes → open in system handler
    if (/^(mailto|tel|sms|itms-apps|itms-services|fb|twitter|x|whatsapp):/i.test(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }

    // External web URLs → open in SFSafariViewController (in-app browser),
    // which lets Stripe checkout / Clerk SSO complete without leaving the app.
    WebBrowser.openBrowserAsync(url, {
      controlsColor: BRAND,
      toolbarColor:  BG,
      dismissButtonStyle: "close",
    }).catch(() => {});
    return false;
  }, []);

  // ── WebView lifecycle ───────────────────────────────────────────────────
  const onLoadEnd = useCallback(() => {
    setLoading(false);
    // Fade out the brand overlay, then drop the native splash.
    Animated.timing(fade, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
  }, [fade]);

  const onError = useCallback((e: { nativeEvent: { description?: string; code?: number } }) => {
    setHardError(e.nativeEvent?.description ?? "Connection failed");
    setLoading(false);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const onHttpError = useCallback((e: { nativeEvent: { statusCode: number } }) => {
    if (e.nativeEvent.statusCode >= 500) {
      setHardError(`Server error (${e.nativeEvent.statusCode})`);
    }
  }, []);

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) setLoading(true);
  }, []);

  const retry = useCallback(() => {
    setHardError(null);
    setLoading(true);
    fade.setValue(1);
    webRef.current?.reload();
  }, [fade]);

  // ── Offline screen ──────────────────────────────────────────────────────
  if (!online) {
    return <StatusScreen
      kind="offline"
      title="No connection"
      body="AICandlez needs an internet connection to stream live market data. Reconnect and we'll resume automatically."
      onRetry={retry}
    />;
  }

  if (hardError) {
    return <StatusScreen
      kind="error"
      title="Trouble reaching AICandlez"
      body={hardError}
      onRetry={retry}
    />;
  }

  // ── WebView ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.flex}>
      <WebView
        ref={webRef}
        source={{ uri: PWA_URL }}

        // Loading & errors
        onLoadEnd={onLoadEnd}
        onError={onError}
        onHttpError={onHttpError}
        onNavigationStateChange={onNavChange}
        renderLoading={() => <BrandOverlay fade={fade} />}
        startInLoadingState={true}

        // Auth & cookies (Clerk session persistence)
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        domStorageEnabled={true}
        cacheEnabled={true}
        incognito={false}

        // Native gesture feel
        allowsBackForwardNavigationGestures={true}
        decelerationRate="normal"
        bounces={true}
        overScrollMode="always"
        scrollEnabled={true}
        nestedScrollEnabled={true}
        pullToRefreshEnabled={true}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"

        // Performance / capability
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={["https://*", "http://*"]}
        applicationNameForUserAgent="AICandlezApp/1.0"

        // Theme
        style={styles.webview}
        containerStyle={styles.webviewContainer}

        // External link interception
        onShouldStartLoadWithRequest={onShouldStartLoad}

        // iOS keyboard behavior (prevents the WebView from shrinking
        // unexpectedly when keyboard opens on input focus).
        keyboardDisplayRequiresUserAction={false}

        // Limit memory pressure during App Store review on older devices.
        cacheMode={Platform.OS === "android" ? "LOAD_DEFAULT" : undefined}
      />
      {loading && <BrandOverlay fade={fade} />}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// BRAND OVERLAY — shown over WebView until first paint
// ───────────────────────────────────────────────────────────────────────────
function BrandOverlay({ fade }: { fade: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { opacity: fade }]}
    >
      <View style={styles.overlayGlow} />
      <Image
        source={require("./assets/icon.png")}
        style={styles.overlayIcon}
        resizeMode="contain"
      />
      <Text style={styles.overlayWord}>AICANDLEZ</Text>
      <Text style={styles.overlaySub}>INSTITUTIONAL · AI</Text>
      <ActivityIndicator size="small" color={BRAND} style={styles.overlaySpin} />
    </Animated.View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// STATUS SCREEN — offline / hard-error
// ───────────────────────────────────────────────────────────────────────────
function StatusScreen({
  kind, title, body, onRetry,
}: { kind: "offline" | "error"; title: string; body: string; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.status, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.statusGlow} />
      <Image
        source={require("./assets/icon.png")}
        style={styles.statusIcon}
        resizeMode="contain"
      />
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusBody}>{body}</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onRetry}
        style={styles.statusButton}
      >
        <Text style={styles.statusButtonText}>
          {kind === "offline" ? "RETRY CONNECTION" : "TRY AGAIN"}
        </Text>
      </TouchableOpacity>
      <Text style={styles.statusFooter}>AICANDLEZ · v1.0</Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// STYLES
// ───────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: BG },
  safe:        { flex: 1, backgroundColor: BG },
  bottomSafe:  { backgroundColor: BG },
  flex:        { flex: 1, backgroundColor: BG },

  webview:           { flex: 1, backgroundColor: BG },
  webviewContainer:  { flex: 1, backgroundColor: BG },

  // Brand overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems:      "center",
    justifyContent:  "center",
  },
  overlayGlow: {
    position:      "absolute",
    width:         320,
    height:        320,
    borderRadius:  160,
    backgroundColor: BRAND,
    opacity:       0.06,
    transform:     [{ scale: 1.4 }],
  },
  overlayIcon: {
    width:  96, height: 96,
    marginBottom: 22,
  },
  overlayWord: {
    color:         TEXT,
    fontSize:      20,
    fontWeight:    "800",
    letterSpacing: 4,
    fontVariant:   ["tabular-nums"],
  },
  overlaySub: {
    color:         BRAND,
    fontSize:      10,
    fontWeight:    "700",
    letterSpacing: 3,
    marginTop:     8,
    textShadowColor:  BRAND_BRGT,
    textShadowRadius: 8,
  },
  overlaySpin: {
    marginTop: 28,
  },

  // Status screen (offline / error)
  status: {
    flex:            1,
    backgroundColor: BG,
    paddingHorizontal: 32,
    alignItems:      "center",
    justifyContent:  "center",
  },
  statusGlow: {
    position:        "absolute",
    width:           420,
    height:          420,
    borderRadius:    210,
    backgroundColor: BRAND,
    opacity:         0.04,
  },
  statusIcon: {
    width:        80, height: 80,
    marginBottom: 18,
    opacity:      0.85,
  },
  statusTitle: {
    color:         TEXT,
    fontSize:      18,
    fontWeight:    "800",
    letterSpacing: 1.2,
    marginBottom:  10,
    textAlign:     "center",
  },
  statusBody: {
    color:        DIM,
    fontSize:     13,
    lineHeight:   20,
    textAlign:    "center",
    marginBottom: 28,
    maxWidth:     340,
  },
  statusButton: {
    backgroundColor:  SURFACE,
    borderWidth:      1,
    borderColor:      BRAND,
    paddingVertical:  12,
    paddingHorizontal: 28,
    borderRadius:     8,
    shadowColor:      BRAND,
    shadowOpacity:    0.4,
    shadowRadius:     12,
    shadowOffset:     { width: 0, height: 0 },
  },
  statusButtonText: {
    color:         BRAND,
    fontSize:      12,
    fontWeight:    "800",
    letterSpacing: 2,
  },
  statusFooter: {
    position:      "absolute",
    bottom:        24,
    color:         DIM,
    fontSize:      9,
    letterSpacing: 2.5,
    opacity:       0.5,
  },
});

// Suppress unused-import warning for NEG color (kept for future error-state styling).
void NEG;
