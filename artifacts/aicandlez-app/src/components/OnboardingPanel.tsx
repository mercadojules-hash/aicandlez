import React, { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   AICandlez — Onboarding / First-Run Guidance Panel
   ───────────────────────────────────────────────────────────────────────────
   Cinematic, institutional onboarding for first-time users.
   Three cards explaining: Paper Trading · AI Automation · Exchange Connection.
   Dismissible — flag persists in localStorage under `aicandlez:onboarded:v1`.
   Brand: neon-green AICandlez. Background: deep ink with green underglow.
   ═══════════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "aicandlez:onboarded:v1";

const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const INK_0       = "#050A07";
const INK_1       = "#0A1410";
const INK_2       = "#0F1F18";
const TEXT_HI     = "rgba(255,255,255,0.95)";
const TEXT_MD     = "rgba(255,255,255,0.72)";
const TEXT_LO     = "rgba(255,255,255,0.54)";

const SANS        = "Inter, 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO        = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

type Card = {
  eyebrow: string;
  title:   string;
  body:    string;
  bullets: string[];
};

const CARDS: Card[] = [
  {
    eyebrow: "STEP 01 · SIMULATION",
    title:   "Paper Trading Mode",
    body:    "Every account starts with $100,000 in simulated capital. Practice manual Buy / Sell, test strategies, and learn the platform — with zero financial risk.",
    bullets: [
      "Manual Buy / Sell on any tracked asset",
      "Trades appear in the execution panel · wins/losses update telemetry live",
      "Portfolio metrics refresh in real time",
      "No exchange connection required",
    ],
  },
  {
    eyebrow: "STEP 02 · AUTOMATION",
    title:   "AI Automation",
    body:    "After activating a subscription and connecting an exchange, you can optionally enable autonomous AI execution. AI trading is OFF by default — you stay in control.",
    bullets: [
      "Up to 3 concurrent AI trades on AICandlez Starter — $39.99/mo",
      "Up to 12 concurrent AI trades on AICandlez Pro — $79.99/mo",
      "3% performance fee on profitable closed trades only · never on losses",
      "Toggle AI execution on or off at any time",
    ],
  },
  {
    eyebrow: "STEP 03 · SECURITY",
    title:   "Exchange Connection",
    body:    "Your exchange credentials are encrypted with AES-256-GCM and a per-user key. Funds stay on the exchange — we never move them, and we never request withdrawal permissions.",
    bullets: [
      "Credentials encrypted in transit and at rest",
      "Funds remain in your exchange account",
      "No withdrawal permissions ever requested",
      "Live mode is opt-in and requires explicit acknowledgement",
    ],
  },
];

export function OnboardingPanel(): React.ReactElement | null {
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    try {
      const flag = window.localStorage.getItem(STORAGE_KEY);
      setDismissed(flag === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss(): void {
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* noop */ }
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <section
      aria-label="Welcome to AICandlez"
      style={{
        position:     "relative",
        margin:       "20px 16px 12px",
        borderRadius: 20,
        overflow:     "hidden",
        background:   `linear-gradient(180deg, ${INK_1} 0%, ${INK_0} 100%)`,
        border:       `1px solid rgba(102,255,102,0.18)`,
        boxShadow:    `0 24px 60px -28px rgba(0,200,83,0.35), inset 0 1px 0 rgba(255,255,255,0.04)`,
        fontFamily:   SANS,
      }}
    >
      {/* Atmospheric green underglow */}
      <div
        aria-hidden
        style={{
          position:   "absolute",
          inset:      0,
          background: `radial-gradient(120% 60% at 50% -10%, rgba(102,255,102,0.10) 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <header
        style={{
          position:       "relative",
          padding:        "18px 18px 12px",
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          gap:            12,
        }}
      >
        <div>
          <div
            style={{
              fontFamily:    MONO,
              fontSize:      10,
              letterSpacing: "0.18em",
              color:         BRAND,
              textTransform: "uppercase",
              opacity:       0.85,
            }}
          >
            Welcome · AICandlez
          </div>
          <h2
            style={{
              margin:        "6px 0 4px",
              fontSize:      20,
              fontWeight:    700,
              letterSpacing: "-0.01em",
              color:         TEXT_HI,
              lineHeight:    1.15,
            }}
          >
            Get started in three steps
          </h2>
          <p
            style={{
              margin:    0,
              fontSize:  13,
              lineHeight: 1.5,
              color:     TEXT_MD,
              maxWidth:  560,
            }}
          >
            Practice in simulation · subscribe and connect an exchange · optionally enable autonomous AI execution. You stay in control at every step.
          </p>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss onboarding"
          style={{
            flex:           "0 0 auto",
            border:         `1px solid rgba(255,255,255,0.10)`,
            background:     "rgba(255,255,255,0.03)",
            color:          TEXT_LO,
            fontFamily:     MONO,
            fontSize:       11,
            letterSpacing:  "0.08em",
            padding:        "6px 10px",
            borderRadius:   10,
            cursor:         "pointer",
            textTransform:  "uppercase",
          }}
        >
          Dismiss
        </button>
      </header>

      {/* Cards */}
      <div
        style={{
          position:             "relative",
          display:              "grid",
          gridTemplateColumns:  "repeat(auto-fit, minmax(240px, 1fr))",
          gap:                  10,
          padding:              "4px 14px 14px",
        }}
      >
        {CARDS.map((c) => (
          <article
            key={c.title}
            style={{
              borderRadius: 14,
              padding:      "14px 14px 12px",
              background:   `linear-gradient(180deg, ${INK_2} 0%, ${INK_1} 100%)`,
              border:       `1px solid rgba(102,255,102,0.10)`,
              display:      "flex",
              flexDirection:"column",
              gap:          8,
            }}
          >
            <div
              style={{
                fontFamily:    MONO,
                fontSize:      9.5,
                letterSpacing: "0.16em",
                color:         BRAND_DEEP,
                textTransform: "uppercase",
              }}
            >
              {c.eyebrow}
            </div>
            <div
              style={{
                fontSize:      15,
                fontWeight:    650,
                color:         TEXT_HI,
                letterSpacing: "-0.005em",
              }}
            >
              {c.title}
            </div>
            <p
              style={{
                margin:    0,
                fontSize:  12.5,
                lineHeight: 1.5,
                color:     TEXT_MD,
              }}
            >
              {c.body}
            </p>
            <ul
              style={{
                margin:     "4px 0 0",
                padding:    0,
                listStyle:  "none",
                display:    "flex",
                flexDirection: "column",
                gap:        5,
              }}
            >
              {c.bullets.map((b) => (
                <li
                  key={b}
                  style={{
                    fontSize:    11.5,
                    lineHeight:  1.45,
                    color:       TEXT_LO,
                    paddingLeft: 14,
                    position:    "relative",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position:     "absolute",
                      left:         0,
                      top:          6,
                      width:        6,
                      height:       6,
                      borderRadius: 999,
                      background:   BRAND,
                      boxShadow:    `0 0 8px ${BRAND}`,
                    }}
                  />
                  {b}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
