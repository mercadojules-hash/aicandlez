import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
  Animated,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSizes } from "../../constants/theme";
import { chakras, Chakra } from "../../data/chakras";
import { useChecklist } from "../../hooks/useChecklist";

const { width } = Dimensions.get("window");

// ─── Web Audio Engine ─────────────────────────────────────────────────────────

interface AudioPlayer {
  isPlaying: boolean;
  isPaused: boolean;
  chakra: Chakra | null;
}

function useChakraAudio() {
  const [player, setPlayer] = useState<AudioPlayer>({ isPlaying: false, isPaused: false, chakra: null });
  const ctxRef = useRef<any>(null);
  const gainRef = useRef<any>(null);
  const oscRef = useRef<any>(null);

  const isWeb = Platform.OS === "web";

  const _getCtx = useCallback(() => {
    if (!isWeb) return null;
    try {
      const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (!AC) return null;
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = new AC();
      }
      return ctxRef.current;
    } catch {
      return null;
    }
  }, [isWeb]);

  const _fadeOut = useCallback((ctx: any, gain: any, duration: number, cb?: () => void) => {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);
    setTimeout(() => cb?.(), duration * 1000 + 50);
  }, []);

  const stop = useCallback(() => {
    if (!isWeb) { setPlayer({ isPlaying: false, isPaused: false, chakra: null }); return; }
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (ctx && gain && oscRef.current) {
      _fadeOut(ctx, gain, 1.2, () => {
        try { oscRef.current?.stop(); } catch {}
        oscRef.current = null;
        gainRef.current = null;
      });
    }
    setPlayer({ isPlaying: false, isPaused: false, chakra: null });
  }, [isWeb, _fadeOut]);

  const play = useCallback((chakra: Chakra) => {
    if (!isWeb) {
      setPlayer({ isPlaying: true, isPaused: false, chakra });
      return;
    }
    // Stop previous immediately
    try {
      if (gainRef.current && ctxRef.current) {
        gainRef.current.gain.cancelScheduledValues(ctxRef.current.currentTime);
        gainRef.current.gain.setValueAtTime(0, ctxRef.current.currentTime);
      }
      oscRef.current?.stop();
    } catch {}
    oscRef.current = null;
    gainRef.current = null;

    const ctx = _getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const hz = parseFloat(chakra.soundFrequency);

    // Gain node with fade-in
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 1.4);
    gain.connect(ctx.destination);

    // Main oscillator
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, ctx.currentTime);
    osc.connect(gain);
    osc.start();

    gainRef.current = gain;
    oscRef.current = osc;
    setPlayer({ isPlaying: true, isPaused: false, chakra });
  }, [isWeb, _getCtx]);

  const pause = useCallback(() => {
    if (!isWeb) { setPlayer(p => ({ ...p, isPlaying: false, isPaused: true })); return; }
    const ctx = ctxRef.current;
    if (ctx?.state === "running") {
      if (gainRef.current) {
        const now = ctx.currentTime;
        gainRef.current.gain.cancelScheduledValues(now);
        gainRef.current.gain.setValueAtTime(gainRef.current.gain.value, now);
        gainRef.current.gain.linearRampToValueAtTime(0.0001, now + 0.5);
      }
      setTimeout(() => {
        try { ctx.suspend(); } catch {}
        setPlayer(p => ({ ...p, isPlaying: false, isPaused: true }));
      }, 550);
    }
  }, [isWeb]);

  const resume = useCallback(() => {
    if (!isWeb) { setPlayer(p => ({ ...p, isPlaying: true, isPaused: false })); return; }
    const ctx = ctxRef.current;
    if (ctx?.state === "suspended" && gainRef.current) {
      ctx.resume().then(() => {
        const now = ctx.currentTime;
        gainRef.current.gain.cancelScheduledValues(now);
        gainRef.current.gain.setValueAtTime(0.0001, now);
        gainRef.current.gain.linearRampToValueAtTime(0.28, now + 0.8);
        setPlayer(p => ({ ...p, isPlaying: true, isPaused: false }));
      });
    }
  }, [isWeb]);

  // Cleanup on unmount
  useEffect(() => () => { try { ctxRef.current?.close(); } catch {} }, []);

  return { player, play, pause, resume, stop };
}

// ─── Pulse animation hook ─────────────────────────────────────────────────────

function usePulse(active: boolean) {
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (active) {
      ring1.setValue(1); ring2.setValue(1);
      anim.current = Animated.loop(
        Animated.stagger(350, [
          Animated.sequence([
            Animated.timing(ring1, { toValue: 1.9, duration: 1000, useNativeDriver: true }),
            Animated.timing(ring1, { toValue: 1, duration: 1000, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring2, { toValue: 1.55, duration: 1000, useNativeDriver: true }),
            Animated.timing(ring2, { toValue: 1, duration: 1000, useNativeDriver: true }),
          ]),
        ])
      );
      anim.current.start();
    } else {
      anim.current?.stop();
      ring1.setValue(1); ring2.setValue(1);
    }
    return () => { anim.current?.stop(); };
  }, [active, ring1, ring2]);

  return { ring1, ring2 };
}

// ─── Sound Healing Section ────────────────────────────────────────────────────

interface AudioControls {
  player: AudioPlayer;
  play: (c: Chakra) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

function SoundHealingSection({ chakra, audio }: { chakra: Chakra; audio: AudioControls }) {
  const isThisChakra = audio.player.chakra?.id === chakra.id;
  const isPlaying = isThisChakra && audio.player.isPlaying;
  const isPaused  = isThisChakra && audio.player.isPaused;
  const { ring1, ring2 } = usePulse(isPlaying);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlaying) {
      audio.pause();
    } else if (isPaused) {
      audio.resume();
    } else {
      audio.play(chakra);
    }
  };

  const r1Opacity = ring1.interpolate({ inputRange: [1, 1.9], outputRange: [0.3, 0] });
  const r2Opacity = ring2.interpolate({ inputRange: [1, 1.55], outputRange: [0.2, 0] });

  return (
    <View style={[sound.container, { borderColor: chakra.color + "35" }]}>
      <View style={sound.top}>
        <View>
          <Text style={sound.freqLabel}>Solfeggio Frequency</Text>
          <Text style={[sound.freq, { color: chakra.color }]}>{chakra.soundFrequency}</Text>
          <Text style={sound.freqSub}>{chakra.soundLabel}</Text>
        </View>
        <View style={sound.orbWrap}>
          <Animated.View style={[sound.ring, { backgroundColor: chakra.color, opacity: r1Opacity, transform: [{ scale: ring1 }] }]} />
          <Animated.View style={[sound.ring, { backgroundColor: chakra.color, opacity: r2Opacity, transform: [{ scale: ring2 }] }]} />
          <TouchableOpacity
            style={[sound.orbBtn, {
              backgroundColor: isPlaying ? chakra.color : chakra.color + "20",
              borderColor: chakra.color + "80",
            }]}
            onPress={handleToggle}
            activeOpacity={0.8}
          >
            <Feather
              name={isPlaying ? "pause" : "play"}
              size={20}
              color={isPlaying ? "#fff" : chakra.color}
            />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={sound.hint}>
        {isPlaying
          ? `Playing ${chakra.soundFrequency} · tap to pause`
          : isPaused
          ? "Paused · tap to resume"
          : "Tap play to begin chakra frequency meditation"}
      </Text>
    </View>
  );
}

// ─── Floating Mini Player ─────────────────────────────────────────────────────

function MiniPlayer({ audio }: { audio: AudioControls }) {
  const { player, pause, resume, stop } = audio;
  const slideAnim = useRef(new Animated.Value(80)).current;
  const isVisible = player.isPlaying || player.isPaused;
  const { ring1 } = usePulse(player.isPlaying);
  const dotOpacity = ring1.interpolate({ inputRange: [1, 1.9], outputRange: [1, 0.2] });

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isVisible ? 0 : 80,
      useNativeDriver: true,
      damping: 18,
      stiffness: 160,
    }).start();
  }, [isVisible, slideAnim]);

  if (!player.chakra) return null;
  const chakra = player.chakra;

  return (
    <Animated.View style={[mini.wrap, { transform: [{ translateY: slideAnim }] }]}>
      <LinearGradient
        colors={[chakra.color + "22", colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[mini.bar, { borderColor: chakra.color + "40" }]}
      >
        {/* Live dot */}
        <Animated.View style={[mini.dot, { backgroundColor: chakra.color, opacity: dotOpacity }]} />

        {/* Symbol */}
        <View style={[mini.imgWrap, { borderColor: chakra.color + "50" }]}>
          <Image source={{ uri: chakra.symbol }} style={mini.img} resizeMode="contain" />
        </View>

        {/* Info */}
        <View style={mini.info}>
          <Text style={mini.name} numberOfLines={1}>{chakra.name}</Text>
          <Text style={[mini.freq, { color: chakra.color }]}>{chakra.soundFrequency}</Text>
        </View>

        {/* Play / Pause */}
        <TouchableOpacity
          style={[mini.btn, { backgroundColor: chakra.color + "20" }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            player.isPlaying ? pause() : resume();
          }}
        >
          <Feather name={player.isPlaying ? "pause" : "play"} size={16} color={chakra.color} />
        </TouchableOpacity>

        {/* Close */}
        <TouchableOpacity
          style={mini.closeBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            stop();
          }}
        >
          <Feather name="x" size={14} color={colors.textDim} />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Crystal Card ─────────────────────────────────────────────────────────────

function CrystalCard({ chakra }: { chakra: Chakra }) {
  const [imgError, setImgError] = useState(false);

  return (
    <View style={[detail.crystalCard, { borderColor: chakra.color + "30" }]}>
      <View style={[detail.crystalImgWrap, { borderColor: chakra.color + "40" }]}>
        {!imgError && chakra.crystalImage ? (
          <>
            <Image
              source={{ uri: chakra.crystalImage }}
              style={detail.crystalImg}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
            <View style={[detail.crystalOverlay, { backgroundColor: chakra.color + "15" }]} />
          </>
        ) : (
          <View style={[detail.crystalFallback, { backgroundColor: chakra.color + "25" }]}>
            <Feather name="hexagon" size={22} color={chakra.color} />
          </View>
        )}
      </View>
      <View style={detail.crystalText}>
        <Text style={detail.crystalName}>{chakra.crystalName}</Text>
        <Text style={detail.crystalBenefit}>{chakra.crystalBenefit}</Text>
      </View>
    </View>
  );
}

// ─── Chakra Detail Modal ──────────────────────────────────────────────────────

function BulletRow({ text, color, icon }: { text: string; color: string; icon: string }) {
  return (
    <View style={detail.bulletRow}>
      <View style={[detail.bulletIcon, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={12} color={color} />
      </View>
      <Text style={detail.bulletText}>{text}</Text>
    </View>
  );
}

function ChakraDetail({
  chakra,
  audio,
  onClose,
}: {
  chakra: Chakra;
  audio: AudioControls;
  onClose: () => void;
}) {
  const handlePosePress = () => {
    onClose();
    setTimeout(() => router.push(`/pose/${chakra.yogaPoseId}` as any), 320);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={[detail.container, { backgroundColor: colors.background }]}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── HERO ────────────────────────────────────────────────────── */}
          <LinearGradient
            colors={[chakra.color + "70", chakra.color + "28", colors.background]}
            style={detail.hero}
          >
            <TouchableOpacity style={detail.closeBtn} onPress={onClose}>
              <Feather name="x" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={[detail.badge, { backgroundColor: chakra.color + "25", borderColor: chakra.color + "50" }]}>
              <Text style={[detail.badgeText, { color: chakra.color }]}>
                {chakra.number} of 7  ·  {chakra.mantra}
              </Text>
            </View>

            {/* Symbol */}
            <View style={detail.symbolOuter}>
              <View style={[detail.symbolGlow, { backgroundColor: chakra.color + "35" }]} />
              <View style={[detail.symbolRing, { borderColor: chakra.color + "60" }]}>
                {chakra.symbol ? (
                  <Image source={{ uri: chakra.symbol }} style={detail.symbolImg} resizeMode="contain" />
                ) : null}
              </View>
            </View>

            <Text style={detail.heroName}>{chakra.name}</Text>
            <Text style={detail.heroSanskrit}>{chakra.sanskrit}</Text>
            <View style={[detail.subtitlePill, { backgroundColor: chakra.color + "20", borderColor: chakra.color + "40" }]}>
              <Text style={[detail.subtitlePillText, { color: chakra.color }]}>✦  "{chakra.subtitle}"</Text>
            </View>
          </LinearGradient>

          <View style={detail.body}>
            {/* Core info pills */}
            <View style={detail.infoRow}>
              <View style={[detail.infoPill, { borderColor: chakra.color + "40" }]}>
                <Feather name="wind" size={12} color={chakra.color} />
                <Text style={[detail.infoPillText, { color: chakra.color }]}>{chakra.element}</Text>
              </View>
              <View style={[detail.infoPill, { borderColor: chakra.color + "40" }]}>
                <Feather name="map-pin" size={12} color={chakra.color} />
                <Text style={[detail.infoPillText, { color: chakra.color }]}>{chakra.location}</Text>
              </View>
            </View>

            {/* Mantra */}
            <View style={[detail.mantraBox, { borderColor: chakra.color + "40" }]}>
              <Text style={[detail.mantraLabel, { color: chakra.color }]}>Seed Mantra</Text>
              <Text style={[detail.mantraText, { color: chakra.color }]}>{chakra.mantra}</Text>
            </View>

            {/* About */}
            <Text style={detail.sectionHead}>About</Text>
            <Text style={detail.bodyText}>{chakra.description}</Text>

            {/* Crystal */}
            <Text style={detail.sectionHead}>Crystal</Text>
            <CrystalCard chakra={chakra} />

            {/* Yoga Pose */}
            <Text style={detail.sectionHead}>Recommended Pose</Text>
            <TouchableOpacity
              style={[detail.poseCard, { borderColor: chakra.color + "30" }]}
              onPress={handlePosePress}
              activeOpacity={0.85}
            >
              <View style={detail.poseImgWrap}>
                <Image source={{ uri: chakra.yogaPoseImage }} style={detail.poseImg} resizeMode="cover" />
                <LinearGradient colors={["transparent", "rgba(10,25,16,0.8)"]} style={detail.poseImgGrad} />
              </View>
              <View style={detail.poseContent}>
                <View style={detail.poseTop}>
                  <Text style={detail.poseName}>{chakra.yogaPoseName}</Text>
                  <View style={[detail.poseNavBtn, { backgroundColor: chakra.color + "20", borderColor: chakra.color + "50" }]}>
                    <Feather name="arrow-right" size={13} color={chakra.color} />
                  </View>
                </View>
                <Text style={detail.poseDesc}>{chakra.yogaPoseDescription}</Text>
              </View>
            </TouchableOpacity>

            {/* Sound Healing */}
            <Text style={detail.sectionHead}>Sound Healing</Text>
            <SoundHealingSection chakra={chakra} audio={audio} />

            {/* Benefits */}
            <Text style={detail.sectionHead}>Benefits When Balanced</Text>
            <View style={detail.sectionCard}>
              {chakra.benefits.map((b) => (
                <BulletRow key={b} text={b} color={chakra.color} icon="check-circle" />
              ))}
            </View>

            {/* Imbalances */}
            <Text style={detail.sectionHead}>Signs of Imbalance</Text>
            <View style={detail.sectionCard}>
              {chakra.imbalances.map((i) => (
                <BulletRow key={i} text={i} color="#e67e22" icon="alert-circle" />
              ))}
            </View>

            {/* Affirmation */}
            <View style={[detail.affirmCard, { backgroundColor: chakra.color + "12", borderColor: chakra.color + "35" }]}>
              <Text style={[detail.affirmLabel, { color: chakra.color }]}>✦  Daily Affirmation</Text>
              <Text style={detail.affirmText}>"{chakra.affirmation}"</Text>
            </View>

            {/* Foods */}
            <Text style={detail.sectionHead}>Healing Foods</Text>
            <View style={detail.chipWrap}>
              {chakra.foods.map((f) => (
                <View key={f} style={[detail.chip, { borderColor: colors.border }]}>
                  <Text style={detail.chipText}>{f}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 72 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Chakra Card (list) ───────────────────────────────────────────────────────

function ChakraCard({ chakra, onPress }: { chakra: Chakra; onPress: () => void }) {
  return (
    <TouchableOpacity style={list.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={[chakra.color + "32", chakra.color + "0A", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={list.cardGrad}
      >
        <View style={[list.accentBar, { backgroundColor: chakra.color }]} />
        <View style={list.cardLeft}>
          <View style={list.topRow}>
            <Text style={[list.num, { color: chakra.color + "80" }]}>
              {String(chakra.number).padStart(2, "0")}
            </Text>
            <View style={[list.subtitlePill, { backgroundColor: chakra.color + "20" }]}>
              <Text style={[list.subtitleText, { color: chakra.color }]}>{chakra.subtitle}</Text>
            </View>
          </View>
          <Text style={list.name}>{chakra.name}</Text>
          <Text style={list.sanskrit}>{chakra.sanskrit}</Text>
          <Text style={list.snippet} numberOfLines={2}>
            {chakra.description.slice(0, 68)}…
          </Text>
        </View>

        {/* Symbol image */}
        <View style={[list.symbolWrap, { borderColor: chakra.color + "45", backgroundColor: chakra.color + "12" }]}>
          <View style={[list.symbolGlow, { backgroundColor: chakra.color + "25" }]} />
          {chakra.symbol ? (
            <Image source={{ uri: chakra.symbol }} style={list.symbolImg} resizeMode="contain" />
          ) : null}
        </View>

        <Feather name="chevron-right" size={15} color={chakra.color + "70"} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChakrasScreen() {
  const [selected, setSelected] = useState<Chakra | null>(null);
  const { markComplete } = useChecklist();
  const audio = useChakraAudio();

  const handleOpen = (c: Chakra) => {
    markComplete("chakra");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(c);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={screen.safe} edges={["top"]}>
        <ScrollView style={screen.scroll} showsVerticalScrollIndicator={false}>
          <View style={screen.header}>
            <Text style={screen.title}>Chakra System</Text>
            <Text style={screen.subtitle}>Your body's energy centers</Text>
          </View>

          <View style={screen.spectrum}>
            {chakras.map((c) => (
              <View key={c.id} style={[screen.specDot, { backgroundColor: c.color }]} />
            ))}
          </View>

          <View style={screen.listWrap}>
            {chakras.map((c) => (
              <ChakraCard key={c.id} chakra={c} onPress={() => handleOpen(c)} />
            ))}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Detail Modal */}
      {selected && (
        <ChakraDetail
          chakra={selected}
          audio={audio}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Floating Mini Player */}
      <MiniPlayer audio={audio} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const screen = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textMuted },
  spectrum: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 6, marginBottom: spacing.md },
  specDot: { flex: 1, height: 4, borderRadius: radius.full, opacity: 0.8 },
  listWrap: { paddingHorizontal: spacing.md, gap: 10 },
});

const list = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    gap: 10,
  },
  accentBar: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    width: 4,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  cardLeft: { flex: 1, paddingLeft: spacing.md + 4 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  num: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  subtitlePill: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  subtitleText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  name: { fontSize: fontSizes.md, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 2 },
  sanskrit: { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium", color: colors.accent, marginBottom: 5 },
  snippet: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 16 },
  symbolWrap: {
    width: 68, height: 68,
    borderRadius: 34, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    overflow: "visible",
  },
  symbolGlow: {
    position: "absolute",
    width: 68, height: 68, borderRadius: 34,
  },
  symbolImg: { width: 54, height: 54 },
});

const detail = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingTop: 54, paddingBottom: 28,
    alignItems: "center", paddingHorizontal: spacing.md,
  },
  closeBtn: {
    position: "absolute", top: 14, right: 16,
    backgroundColor: colors.card, borderRadius: radius.full,
    padding: 8, borderWidth: 1, borderColor: colors.border,
  },
  badge: {
    borderRadius: radius.full, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 5, marginBottom: 18,
  },
  badgeText: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  symbolOuter: { alignItems: "center", justifyContent: "center", marginBottom: 16 },
  symbolGlow: { position: "absolute", width: 170, height: 170, borderRadius: 85 },
  symbolRing: {
    width: 124, height: 124, borderRadius: 62, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(13,31,22,0.55)", overflow: "hidden",
  },
  symbolImg: { width: 100, height: 100 },
  heroName: {
    fontSize: fontSizes.xxl, fontFamily: "Inter_700Bold",
    color: colors.text, marginBottom: 4, textAlign: "center",
  },
  heroSanskrit: {
    fontSize: fontSizes.sm, fontFamily: "Inter_500Medium",
    color: colors.textMuted, marginBottom: 14,
  },
  subtitlePill: {
    borderRadius: radius.full, borderWidth: 1,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  subtitlePillText: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  infoRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  infoPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card,
  },
  infoPillText: { fontSize: fontSizes.xs, fontFamily: "Inter_500Medium" },
  mantraBox: {
    alignItems: "center", borderWidth: 1, borderRadius: radius.lg,
    paddingVertical: 14, marginBottom: spacing.sm,
  },
  mantraLabel: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 6 },
  mantraText: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: 10 },
  sectionHead: {
    fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold",
    color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  bodyText: {
    fontSize: fontSizes.sm, fontFamily: "Inter_400Regular",
    color: colors.textMuted, lineHeight: 22,
  },
  crystalCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, padding: spacing.md,
  },
  crystalImgWrap: { width: 60, height: 60, borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  crystalImg: { width: "100%", height: "100%" },
  crystalOverlay: { ...StyleSheet.absoluteFillObject },
  crystalFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  crystalText: { flex: 1 },
  crystalName: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", color: colors.text, marginBottom: 6 },
  crystalBenefit: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 18 },
  poseCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  poseImgWrap: { width: "100%", height: 140 },
  poseImg: { width: "100%", height: "100%" },
  poseImgGrad: { ...StyleSheet.absoluteFillObject },
  poseContent: { padding: spacing.md },
  poseTop: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 6,
  },
  poseName: { fontSize: fontSizes.md, fontFamily: "Inter_600SemiBold", color: colors.text },
  poseNavBtn: { borderRadius: radius.full, borderWidth: 1, padding: 6 },
  poseDesc: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 18 },
  sectionCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: 10,
  },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  bulletText: { flex: 1, fontSize: fontSizes.sm, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 20 },
  affirmCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.lg, alignItems: "center" },
  affirmLabel: { fontSize: fontSizes.xs, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5, marginBottom: 10 },
  affirmText: {
    fontSize: fontSizes.md, fontFamily: "Inter_400Regular",
    color: colors.text, textAlign: "center", lineHeight: 26, fontStyle: "italic",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card },
  chipText: { fontSize: fontSizes.xs, fontFamily: "Inter_400Regular", color: colors.textMuted },
});

const sound = StyleSheet.create({
  container: {
    borderRadius: radius.lg, borderWidth: 1,
    backgroundColor: colors.card, padding: spacing.md,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  freqLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: colors.textMuted, letterSpacing: 1.5, marginBottom: 4 },
  freq: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 3 },
  freqSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted },
  orbWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 56, height: 56, borderRadius: 28 },
  orbBtn: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  hint: {
    fontSize: 11, fontFamily: "Inter_400Regular",
    color: colors.textMuted, marginTop: 12, textAlign: "center",
  },
});

const mini = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 0,
    left: spacing.md,
    right: spacing.md,
    marginBottom: 12,
    zIndex: 999,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  imgWrap: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(13,31,22,0.6)", overflow: "hidden",
  },
  img: { width: 28, height: 28 },
  info: { flex: 1 },
  name: { fontSize: fontSizes.sm, fontFamily: "Inter_600SemiBold", color: colors.text },
  freq: { fontSize: 11, fontFamily: "Inter_500Medium" },
  btn: { padding: 8, borderRadius: radius.full },
  closeBtn: { padding: 8 },
});
