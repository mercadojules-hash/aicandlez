import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Error Boundary ─────────────────────────────────────────────────────────────
// Catches any render-phase exception in the entire app tree and surfaces it
// visually instead of leaving a blank body with no indication of what failed.
//
// Production-safe diagnostic mode:
// - Logs error.message + error.stack + React componentStack to console
// - Captures current URL, hostname (shell discriminator), and last visible
//   route so we can correlate customer vs admin host + path.
// - Mirrors the full payload onto `window.__AIC_LAST_ERROR` so the user can
//   copy it from devtools and paste it back without screenshots.
// - Renders the componentStack inline (collapsible) so the crash self-identifies
//   even when the user can't open devtools (Safari iOS, locked-down corp).

interface CapturedError {
  message: string;
  stack: string;
  componentStack: string;
  href: string;
  host: string;
  shell: "customer" | "admin" | "unknown";
  ts: string;
}

interface EBState { error: CapturedError | null }

function detectShell(): "customer" | "admin" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  const h = window.location.hostname.toLowerCase();
  if (h.startsWith("admintrade.")) return "admin";
  if (h.startsWith("trade."))      return "customer";
  return "unknown";
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(): EBState {
    return { error: null }; // populated in componentDidCatch with full context
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    const captured: CapturedError = {
      message:        error.message ?? String(error),
      stack:          error.stack ?? "(no stack)",
      componentStack: info.componentStack ?? "(no componentStack)",
      href:           typeof window !== "undefined" ? window.location.href : "(ssr)",
      host:           typeof window !== "undefined" ? window.location.hostname : "(ssr)",
      shell:          detectShell(),
      ts:             new Date().toISOString(),
    };

    // Console — grouped, full payload, never truncated.
    /* eslint-disable no-console */
    console.group(`%c[AICandlez] RENDER CRASH @ ${captured.shell}`, "color:#ff4455;font-weight:bold");
    console.error("message:        ", captured.message);
    console.error("href:           ", captured.href);
    console.error("host:           ", captured.host);
    console.error("shell:          ", captured.shell);
    console.error("ts:             ", captured.ts);
    console.error("error.stack:    \n" + captured.stack);
    console.error("componentStack: \n" + captured.componentStack);
    console.groupEnd();
    /* eslint-enable no-console */

    // Window mirror for copy-paste diagnostics.
    if (typeof window !== "undefined") {
      (window as unknown as { __AIC_LAST_ERROR: CapturedError }).__AIC_LAST_ERROR = captured;
    }

    this.setState({ error: captured });
  }

  override render() {
    const e = this.state.error;
    if (e) {
      const monoBox: React.CSSProperties = {
        background: "#040A14", border: "1px solid #0D2035",
        borderRadius: 4, padding: "10px 12px",
        fontSize: 10, color: "#7a9eb8", lineHeight: 1.55,
        maxWidth: 720, width: "100%",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        maxHeight: 220, overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        textAlign: "left",
      };
      return (
        <div style={{
          position: "fixed", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#000508", gap: 12, padding: 24,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          overflow: "auto",
        }}>
          <div style={{ fontSize: 11, color: "#4a6a80", letterSpacing: "0.2em" }}>
            AICANDLEZ · {e.shell.toUpperCase()} · {e.host}
          </div>
          <div style={{ fontSize: 13, color: "#ff4455", fontWeight: "bold", letterSpacing: "0.1em" }}>
            BOOTSTRAP ERROR
          </div>
          <div style={{
            fontSize: 12, color: "#ffaab2",
            maxWidth: 720, textAlign: "center", lineHeight: 1.6,
            background: "#1a0408", border: "1px solid #4a0810",
            borderRadius: 4, padding: "10px 14px",
          }}>
            {e.message}
          </div>
          <div style={{ fontSize: 9, color: "#4a6a80", letterSpacing: "0.18em" }}>
            COMPONENT STACK
          </div>
          <pre style={monoBox}>{e.componentStack.trim()}</pre>
          <div style={{ fontSize: 9, color: "#4a6a80", letterSpacing: "0.18em" }}>
            ERROR STACK
          </div>
          <pre style={monoBox}>{e.stack.trim()}</pre>
          <div style={{ fontSize: 9, color: "#4a6a80", maxWidth: 720, textAlign: "center", lineHeight: 1.5 }}>
            Full payload mirrored to <span style={{ color: "#7CFF00" }}>window.__AIC_LAST_ERROR</span> —
            open devtools console and run <span style={{ color: "#7CFF00" }}>copy(window.__AIC_LAST_ERROR)</span>.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 24px",
              background: "#00aaff18", color: "#00aaff",
              border: "1px solid #00aaff40", borderRadius: 4,
              fontSize: 11, cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Mount ──────────────────────────────────────────────────────────────────────
// Guard against a missing root element — surfaces an error instead of throwing
// an unhandled exception that leaves the body completely blank.

const rootEl = document.getElementById("root");

if (!rootEl) {
  // Extremely defensive: if the div is missing (bad cache, wrong HTML), show why
  document.body.style.cssText = "margin:0;background:#000508;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:monospace";
  document.body.innerHTML = '<div style="color:#ff4455;font-size:13px">FATAL: #root element not found — check index.html</div>';
} else {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
