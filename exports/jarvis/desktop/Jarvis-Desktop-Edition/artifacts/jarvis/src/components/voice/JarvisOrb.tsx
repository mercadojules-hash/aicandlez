import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbState =
  | "idle"
  | "listening"
  | "speaking"
  | "processing"
  | "disabled";

/**
 * The Jarvis presence — an animated voice orb that reflects the live state of
 * the interface. Pure presentation: it never holds audio or recognition state,
 * it only renders the `state` it is handed. Motion is synthetic (framer-motion)
 * so it is robust regardless of microphone/analyser availability.
 */
export function JarvisOrb({
  state,
  size = 220,
  onClick,
  className,
}: {
  state: OrbState;
  size?: number;
  onClick?: () => void;
  className?: string;
}) {
  const active = state === "listening" || state === "speaking";
  const interactive = typeof onClick === "function";

  // State-driven palette — cyan for listening/idle, a warmer cyan-white for
  // speaking, muted for disabled.
  const coreColor =
    state === "disabled"
      ? "hsl(240 5% 35%)"
      : state === "speaking"
        ? "hsl(190 95% 65%)"
        : "hsl(190 90% 50%)";

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Outer ambient rings */}
      {[0, 1, 2].map((ring) => (
        <motion.div
          key={ring}
          className="absolute rounded-full border"
          style={{
            width: size,
            height: size,
            borderColor: coreColor,
            opacity: state === "disabled" ? 0.08 : 0.18,
          }}
          animate={
            active
              ? {
                  scale: [0.7, 1.05, 0.7],
                  opacity: [0.25, 0, 0.25],
                }
              : { scale: 0.82, opacity: state === "disabled" ? 0.06 : 0.14 }
          }
          transition={
            active
              ? {
                  duration: state === "speaking" ? 1.6 : 2.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: ring * (state === "speaking" ? 0.25 : 0.4),
                }
              : { duration: 0.6 }
          }
        />
      ))}

      {/* Glow halo */}
      <motion.div
        className="absolute rounded-full blur-2xl"
        style={{
          width: size * 0.72,
          height: size * 0.72,
          background: `radial-gradient(circle, ${coreColor}, transparent 70%)`,
        }}
        animate={{
          opacity:
            state === "disabled"
              ? 0.08
              : state === "speaking"
                ? [0.45, 0.8, 0.45]
                : state === "listening"
                  ? [0.35, 0.6, 0.35]
                  : state === "processing"
                    ? [0.3, 0.5, 0.3]
                    : [0.22, 0.34, 0.22],
        }}
        transition={{
          duration: state === "speaking" ? 1.2 : state === "idle" ? 4 : 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Core sphere */}
      <motion.button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-label="Jarvis voice orb"
        className={cn(
          "relative flex items-center justify-center rounded-full",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        style={{
          width: size * 0.5,
          height: size * 0.5,
          background: `radial-gradient(circle at 35% 30%, ${coreColor}, hsl(240 10% 6%) 78%)`,
          boxShadow: `0 0 ${active ? 48 : 24}px ${coreColor}55, inset 0 0 40px hsl(240 10% 4% / 0.7)`,
          border: `1px solid ${coreColor}66`,
        }}
        animate={
          state === "processing"
            ? { scale: [1, 1.04, 1] }
            : state === "speaking"
              ? { scale: [1, 1.08, 1] }
              : state === "listening"
                ? { scale: [1, 1.05, 1] }
                : { scale: [1, 1.02, 1] }
        }
        transition={{
          duration:
            state === "speaking" ? 0.7 : state === "processing" ? 1 : 3.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        whileTap={interactive ? { scale: 0.95 } : undefined}
      >
        {state === "processing" ? (
          <motion.div
            className="h-1/3 w-1/3 rounded-full border-2 border-transparent"
            style={{ borderTopColor: coreColor, borderRightColor: coreColor }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
          />
        ) : (
          <OrbWaveform state={state} color={coreColor} />
        )}
      </motion.button>
    </div>
  );
}

/** A compact equalizer rendered inside the orb core. */
function OrbWaveform({ state, color }: { state: OrbState; color: string }) {
  const animate = state === "listening" || state === "speaking";
  const bars = 5;
  const peak = state === "speaking" ? 1 : 0.7;

  return (
    <div className="flex h-1/3 items-center justify-center gap-1">
      {Array.from({ length: bars }).map((_, i) => {
        const base = 0.28 + Math.abs(i - (bars - 1) / 2) * -0.06 + 0.18;
        return (
          <motion.span
            key={i}
            className="w-[3px] rounded-full"
            style={{ backgroundColor: color, opacity: 0.9 }}
            animate={
              animate
                ? { height: [`${base * 60}%`, `${peak * 100}%`, `${base * 60}%`] }
                : { height: "26%" }
            }
            transition={
              animate
                ? {
                    duration: state === "speaking" ? 0.5 : 0.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.08,
                  }
                : { duration: 0.4 }
            }
          />
        );
      })}
    </div>
  );
}
