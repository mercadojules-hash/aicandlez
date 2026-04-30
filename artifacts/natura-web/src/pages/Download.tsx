import { useState } from "react";

const FILE_NAME = "natura-yoga-ai-v1.0.0.zip";
const FILE_SIZE = "31 MB";
const VERSION = "v1.0.0";

export default function Download() {
  const [clicked, setClicked] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const downloadUrl = `${base}/${FILE_NAME}`;

  const handleDownload = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 3000);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #071410 0%, #0a1f18 50%, #071410 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(134,187,154,0.2)",
          borderRadius: 24,
          padding: "48px 40px",
          textAlign: "center",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Logo / Icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3d9e6a, #86bb9a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 28px",
            fontSize: 36,
          }}
        >
          🌿
        </div>

        <h1
          style={{
            color: "#e8f5ee",
            fontSize: 26,
            fontWeight: 700,
            margin: "0 0 8px",
            letterSpacing: "-0.5px",
          }}
        >
          Natura Yoga AI
        </h1>
        <p
          style={{
            color: "#86bb9a",
            fontSize: 14,
            margin: "0 0 32px",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Mobile App Source · {VERSION}
        </p>

        {/* File info */}
        <div
          style={{
            background: "rgba(134,187,154,0.08)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 28,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <div style={{ color: "#e8f5ee", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              {FILE_NAME}
            </div>
            <div style={{ color: "#6b9b7e", fontSize: 12 }}>
              Expo React Native · All assets included
            </div>
          </div>
          <div
            style={{
              color: "#86bb9a",
              fontSize: 13,
              fontWeight: 600,
              background: "rgba(134,187,154,0.12)",
              padding: "4px 10px",
              borderRadius: 6,
            }}
          >
            {FILE_SIZE}
          </div>
        </div>

        {/* What's included */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 32,
            textAlign: "left",
          }}
        >
          <div style={{ color: "#86bb9a", fontSize: 11, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            Includes
          </div>
          {[
            "61 locally bundled images (offline-ready)",
            "All screens: Home, AI Coach, Chakras, Breathwork",
            "24 yoga poses · 7 chakra guides · 4 journey weeks",
            "app.json · package.json · full source",
          ].map((item) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#3d9e6a", fontSize: 14 }}>✓</span>
              <span style={{ color: "#b8d4c2", fontSize: 13 }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Download button */}
        <a
          href={downloadUrl}
          download={FILE_NAME}
          onClick={handleDownload}
          style={{
            display: "block",
            background: clicked
              ? "linear-gradient(135deg, #2d7a50, #3d9e6a)"
              : "linear-gradient(135deg, #3d9e6a, #5bb88a)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            padding: "16px 24px",
            borderRadius: 14,
            textDecoration: "none",
            letterSpacing: 0.3,
            transition: "all 0.2s ease",
            boxShadow: "0 4px 20px rgba(61,158,106,0.35)",
          }}
        >
          {clicked ? "⬇ Downloading…" : "⬇ Download Natura Yoga AI (v1.0.0)"}
        </a>

        <p style={{ color: "#4a7a5a", fontSize: 12, marginTop: 16 }}>
          Unzip and run <code style={{ color: "#86bb9a" }}>pnpm install</code> then{" "}
          <code style={{ color: "#86bb9a" }}>npx expo start</code>
        </p>
      </div>

      {/* Direct URL hint */}
      <p style={{ color: "#2e5c40", fontSize: 12, marginTop: 24, textAlign: "center" }}>
        Direct URL:{" "}
        <span style={{ color: "#4a7a5a", fontFamily: "monospace" }}>{downloadUrl}</span>
      </p>
    </div>
  );
}
