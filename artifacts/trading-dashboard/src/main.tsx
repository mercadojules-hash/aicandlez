import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Error Boundary ─────────────────────────────────────────────────────────────
// Catches any render-phase exception in the entire app tree and surfaces it
// visually instead of leaving a blank body with no indication of what failed.

interface EBState { hasError: boolean; error: Error | null }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Apex] Bootstrap render error:", error.message, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: "fixed", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#000508", gap: 16, padding: 24,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}>
          <div style={{ fontSize: 11, color: "#4a6a80", letterSpacing: "0.2em" }}>
            APEX TRADER
          </div>
          <div style={{ fontSize: 13, color: "#ff4455", fontWeight: "bold" }}>
            BOOTSTRAP ERROR
          </div>
          <div style={{
            fontSize: 11, color: "#7a9eb8",
            maxWidth: 480, textAlign: "center", lineHeight: 1.6,
            background: "#040A14", border: "1px solid #0D2035",
            borderRadius: 4, padding: "12px 16px",
          }}>
            {this.state.error?.message ?? "Unknown render error"}
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
