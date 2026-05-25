/**
 * ExecutionFeedback.tsx — Cinematic premium feedback banner for trade execution.
 *
 * Replaces the simple toast with a full-width glowing banner that drops from
 * the top of the viewport. Designed to feel like a Bloomberg terminal meets a
 * futuristic AI trading desk — animated scanline sweep, pulsing border, particle
 * shimmer, and state-aware colour energy.
 *
 * Rendered via React portal to <body> so `position: fixed` escapes any
 * transformed ancestor (.page-enter, etc.).
 *
 * States:
 *   submitted → cyan  · "ORDER SUBMITTED"  · short blip       · 2.5s
 *   pending   → amber · "PENDING FILL"     · soft tick        · 4.5s
 *   filled    → green · "TRADE EXECUTED"   · 3-note chord     · 6.0s
 *   profit    → green · "PROFITABLE FILL"  · 4-note arpeggio  · 6.5s  (+ gold shimmer)
 *   rejected  → red   · "ORDER REJECTED"   · descending buzz  · 6.0s
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { playExecutionSound, type FeedbackState } from "@/lib/executionSounds";

export interface ExecutionFeedbackPayload {
  state:     FeedbackState;
  symbol?:   string;
  side?:     "BUY" | "SELL" | "LONG" | "SHORT" | string;
  notional?: number;
  orderId?:  string;
  status?:   string;          // raw broker status (e.g. "pending_new", "filled")
  message?:  string;          // for errors or extra context
  /** Force a key change so the same state replays animation & sound. */
  nonce?:    number;
}

interface Props {
  payload: ExecutionFeedbackPayload | null;
  onDismiss: () => void;
}

const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

const PALETTE: Record<FeedbackState, {
  primary: string;
  glow:    string;
  bg:      string;
  border:  string;
  label:   string;
  accent:  string;
  duration:number;
}> = {
  submitted: {
    primary: "#00e5ff",
    glow:    "rgba(0,229,255,0.55)",
    bg:      "linear-gradient(180deg, rgba(0,40,55,0.96) 0%, rgba(0,20,35,0.96) 100%)",
    border:  "rgba(0,229,255,0.65)",
    label:   "ORDER SUBMITTED",
    accent:  "rgba(0,229,255,0.20)",
    duration:2500,
  },
  pending: {
    primary: "#ffb547",
    glow:    "rgba(255,181,71,0.50)",
    bg:      "linear-gradient(180deg, rgba(50,32,0,0.96) 0%, rgba(30,18,0,0.96) 100%)",
    border:  "rgba(255,181,71,0.60)",
    label:   "PENDING FILL",
    accent:  "rgba(255,181,71,0.18)",
    duration:4500,
  },
  filled: {
    primary: "#00ff88",
    glow:    "rgba(0,255,136,0.65)",
    bg:      "linear-gradient(180deg, rgba(0,50,28,0.96) 0%, rgba(0,24,14,0.96) 100%)",
    border:  "rgba(0,255,136,0.75)",
    label:   "TRADE EXECUTED",
    accent:  "rgba(0,255,136,0.22)",
    duration:6000,
  },
  profit: {
    primary: "#00ff88",
    glow:    "rgba(255,215,80,0.65)",
    bg:      "linear-gradient(180deg, rgba(0,60,34,0.96) 0%, rgba(40,30,0,0.95) 100%)",
    border:  "rgba(255,215,80,0.80)",
    label:   "PROFITABLE FILL",
    accent:  "rgba(255,215,80,0.22)",
    duration:6500,
  },
  rejected: {
    primary: "#ff5577",
    glow:    "rgba(255,85,119,0.55)",
    bg:      "linear-gradient(180deg, rgba(50,0,12,0.96) 0%, rgba(28,0,8,0.96) 100%)",
    border:  "rgba(255,85,119,0.70)",
    label:   "ORDER REJECTED",
    accent:  "rgba(255,85,119,0.20)",
    duration:6000,
  },
};

export function ExecutionFeedback({ payload, onDismiss }: Props) {
  const [phase, setPhase] = useState<"enter" | "show" | "exit">("enter");

  // Reset animation phase + replay sound whenever payload identity changes.
  useEffect(() => {
    if (!payload) return;
    setPhase("enter");
    playExecutionSound(payload.state);
    const t1 = setTimeout(() => setPhase("show"), 30);
    const cfg = PALETTE[payload.state];
    const t2 = setTimeout(() => setPhase("exit"), cfg.duration - 400);
    const t3 = setTimeout(() => onDismiss(),     cfg.duration);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [payload, onDismiss]);

  if (!payload || typeof document === "undefined") return null;

  const cfg     = PALETTE[payload.state];
  const sideTxt = payload.side
    ? (payload.side === "BUY" || payload.side === "LONG"  ? "LONG"
      : payload.side === "SELL" || payload.side === "SHORT" ? "SHORT"
      : String(payload.side).toUpperCase())
    : null;
  const notionalTxt = payload.notional ? `$${payload.notional.toLocaleString()}` : null;
  const orderIdShort = payload.orderId ? payload.orderId.slice(0, 8).toUpperCase() : null;
  const isProfit = payload.state === "profit";

  const enterY  = phase === "enter" ? -120 : 0;
  const exitY   = phase === "exit"  ? -120 : enterY;
  const opacity = phase === "enter" ? 0    : phase === "exit" ? 0 : 1;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: `translate(-50%, ${exitY}px)`,
        zIndex: 2147483647,
        width: "min(560px, calc(100vw - 24px))",
        cursor: "pointer",
        opacity,
        transition: "transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease",
        pointerEvents: "auto",
      }}
    >
      {/* Outer glow halo */}
      <div style={{
        position: "absolute",
        inset: -2,
        borderRadius: 18,
        background: cfg.glow,
        filter: "blur(28px)",
        opacity: 0.6,
        animation: "ef-halo 2.4s ease-in-out infinite",
        pointerEvents: "none",
      }}/>

      {/* Main banner card */}
      <div style={{
        position: "relative",
        background: cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        borderRadius: 16,
        padding: "16px 20px 14px",
        overflow: "hidden",
        boxShadow: `0 14px 56px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04), 0 0 32px ${cfg.glow}`,
        backdropFilter: "blur(28px)",
      }}>

        {/* Scanline sweep — single bright pass across the top */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent 0%, ${cfg.primary} 50%, transparent 100%)`,
          animation: "ef-scanline 1.8s ease-out",
          pointerEvents: "none",
        }}/>

        {/* Bottom edge pulse */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "10%", right: "10%", height: 1,
          background: `linear-gradient(90deg, transparent, ${cfg.primary}, transparent)`,
          opacity: 0.6,
          animation: "ef-edge-pulse 1.6s ease-in-out infinite",
          pointerEvents: "none",
        }}/>

        {/* Profit shimmer overlay (gold) */}
        {isProfit && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(115deg, transparent 35%, rgba(255,215,80,0.18) 50%, transparent 65%)",
            animation: "ef-shimmer 2.4s ease-in-out infinite",
            pointerEvents: "none",
          }}/>
        )}

        {/* Ambient particles */}
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden", borderRadius:16 }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{
              position:"absolute",
              width: 3, height: 3, borderRadius: "50%",
              background: cfg.primary,
              boxShadow: `0 0 6px ${cfg.glow}`,
              left:   `${15 + i * 18}%`,
              bottom: -4,
              opacity: 0,
              animation: `ef-particle 2.6s ${i * 0.28}s ease-out infinite`,
            }}/>
          ))}
        </div>

        {/* Row 1: status indicator + label + dismiss hint */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          marginBottom: 10, position:"relative",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {/* Pulsing status dot */}
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: cfg.primary,
              boxShadow: `0 0 12px ${cfg.glow}, 0 0 20px ${cfg.glow}`,
              animation: "ef-dot-pulse 1.1s ease-in-out infinite",
            }}/>
            <div style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 800,
              letterSpacing: "0.22em",
              color: cfg.primary,
              textShadow: `0 0 12px ${cfg.glow}`,
            }}>{cfg.label}</div>
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 8.5, fontWeight: 600,
            color: "rgba(255,255,255,0.38)", letterSpacing: "0.10em",
          }}>TAP TO DISMISS</div>
        </div>

        {/* Row 2: symbol + side + notional (the headline metrics) */}
        {(payload.symbol || sideTxt || notionalTxt) && (
          <div style={{
            display:"flex", alignItems:"baseline", gap:14, flexWrap:"wrap",
            marginBottom: payload.orderId || payload.status || payload.message ? 8 : 0,
            position:"relative",
          }}>
            {payload.symbol && (
              <span style={{
                fontFamily: MONO, fontSize: 22, fontWeight: 800,
                color: "#ffffff", letterSpacing: "0.02em",
                textShadow: `0 0 16px ${cfg.glow}`,
              }}>{payload.symbol}</span>
            )}
            {sideTxt && (
              <span style={{
                fontFamily: SANS, fontSize: 10, fontWeight: 800,
                color: cfg.primary,
                background: cfg.accent,
                border: `1px solid ${cfg.border}`,
                padding: "3px 9px", borderRadius: 5,
                letterSpacing: "0.16em",
              }}>{sideTxt}</span>
            )}
            {notionalTxt && (
              <span style={{
                fontFamily: MONO, fontSize: 16, fontWeight: 700,
                color: "rgba(255,255,255,0.92)",
                marginLeft: "auto",
              }}>{notionalTxt}</span>
            )}
          </div>
        )}

        {/* Row 3: order id · broker status · or error message */}
        {(payload.orderId || payload.status || payload.message) && (
          <div style={{
            display:"flex", alignItems:"center", gap:12, flexWrap:"wrap",
            paddingTop: 8,
            borderTop: `1px solid ${cfg.accent}`,
            position:"relative",
          }}>
            {orderIdShort && (
              <span style={{
                fontFamily: MONO, fontSize: 9.5, fontWeight: 600,
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.08em",
              }}>
                <span style={{ color:"rgba(255,255,255,0.30)" }}>ORDER </span>
                {orderIdShort}
              </span>
            )}
            {payload.status && (
              <span style={{
                fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
                color: cfg.primary,
                letterSpacing: "0.08em",
              }}>
                <span style={{ color:"rgba(255,255,255,0.30)" }}>STATUS </span>
                {payload.status.toUpperCase()}
              </span>
            )}
            {payload.message && (
              <span style={{
                fontFamily: SANS, fontSize: 11, fontWeight: 500,
                color: "rgba(255,255,255,0.78)",
                flex: 1, minWidth: 0,
              }}>{payload.message}</span>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ef-halo       { 0%,100% { opacity:0.45; transform:scale(1) } 50% { opacity:0.75; transform:scale(1.02) } }
        @keyframes ef-scanline   { 0% { transform:translateX(-100%); opacity:0 } 20% { opacity:1 } 100% { transform:translateX(100%); opacity:0 } }
        @keyframes ef-edge-pulse { 0%,100% { opacity:0.35 } 50% { opacity:0.85 } }
        @keyframes ef-shimmer    { 0% { transform:translateX(-60%) } 100% { transform:translateX(60%) } }
        @keyframes ef-particle   { 0% { transform:translateY(0) scale(0.6); opacity:0 } 20% { opacity:0.9 } 100% { transform:translateY(-80px) scale(1.1); opacity:0 } }
        @keyframes ef-dot-pulse  { 0%,100% { transform:scale(1); opacity:1 } 50% { transform:scale(1.35); opacity:0.75 } }
      `}</style>
    </div>,
    document.body,
  );
}
