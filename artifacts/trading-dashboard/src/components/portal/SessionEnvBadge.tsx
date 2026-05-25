/**
 * SessionEnvBadge — explicit PAPER / ADMIN environment label.
 *
 * Renders a small monospace pill that visually confirms which execution
 * environment the current session is in. Used both at the top of the
 * customer/admin shells (always-visible reassurance) and inside any
 * order-related modal so the user can never confuse a paper sandbox for
 * a live-execution surface.
 *
 * Variants:
 *   • PAPER  — non-admin session. Neon-green. Customer paper-only.
 *   • ADMIN  — admin / super-admin session. Amber. Operator-side modal
 *              that may eventually arm live execution (Phase 2). Today
 *              the matrix click sink is a placeholder; this badge makes
 *              that role context unambiguous regardless.
 *
 * `LIVE` is intentionally NOT exposed to customer code paths. Customer
 * portal real-money execution is server-side only (operator-driven via
 * `placeLiveAutoOrderForUser`), gated by the `customer_live_execution_
 * disabled` kill switch documented in replit.md. The customer surface
 * has no UI control that can flip to LIVE — so this component does not
 * render a LIVE variant on the customer path. Keeps the safety promise
 * loud and load-bearing.
 */

import { useUserRole } from "../../hooks/useUserRole";

type Variant = "PAPER" | "ADMIN";
type Size    = "sm" | "md";

const STYLE = {
  PAPER: {
    color:  "#66FF66",
    bg:     "linear-gradient(180deg, rgba(102,255,102,0.14) 0%, rgba(102,255,102,0.04) 100%)",
    border: "#66FF66",
    glow:   "rgba(102,255,102,0.18)",
    label:  "PAPER",
    title:  "Paper-trading sandbox · simulated execution only · no real funds",
  },
  ADMIN: {
    color:  "#FFB020",
    bg:     "linear-gradient(180deg, rgba(255,176,32,0.14) 0%, rgba(255,176,32,0.04) 100%)",
    border: "#FFB020",
    glow:   "rgba(255,176,32,0.22)",
    label:  "ADMIN",
    title:  "Operator session · admintrade host · privileged controls present",
  },
} as const;

export function SessionEnvBadge({
  variant,
  size = "md",
}: {
  /** Optional override. When omitted, resolves from `useUserRole()`. */
  variant?: Variant;
  size?: Size;
}) {
  const { isAdmin } = useUserRole();
  const v: Variant = variant ?? (isAdmin ? "ADMIN" : "PAPER");
  const s = STYLE[v];

  const pad = size === "sm" ? "4px 9px" : "6px 12px";
  const fs  = size === "sm" ? 9 : 10;
  const dot = size === "sm" ? 6 : 7;

  return (
    <div
      title={s.title}
      role="status"
      aria-label={`Session environment: ${s.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: pad,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: fs,
        fontWeight: 800,
        letterSpacing: "0.18em",
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: `0 0 0 1px ${s.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          width: dot,
          height: dot,
          borderRadius: "50%",
          background: s.color,
          boxShadow: `0 0 8px ${s.color}`,
        }}
      />
      <span>{s.label}</span>
    </div>
  );
}
