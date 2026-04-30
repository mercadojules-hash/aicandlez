const FILE_NAME = "natura-yoga-ai-v1.0.0.zip";

export default function Download() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const downloadUrl = `${base}/${FILE_NAME}`;

  console.log("Download URL:", window.location.origin + downloadUrl);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #071410 0%, #0a1f18 50%, #071410 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "32px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 500, margin: "0 auto" }}>

        {/* ── DOWNLOAD BUTTON — top of page, always visible ── */}
        <a
          href={downloadUrl}
          download={FILE_NAME}
          style={{
            display: "block",
            padding: "22px 24px",
            background: "#2ecc71",
            color: "#fff",
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            borderRadius: 12,
            marginBottom: 24,
            textDecoration: "none",
            boxShadow: "0 4px 24px rgba(46,204,113,0.4)",
            letterSpacing: 0.2,
          }}
        >
          ⬇ Download Natura Yoga AI (v1.0.0)
        </a>

        {/* File details */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(134,187,154,0.2)",
            borderRadius: 16,
            padding: "28px 28px",
            color: "#e8f5ee",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3d9e6a, #86bb9a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                flexShrink: 0,
              }}
            >
              🌿
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
                Natura Yoga AI
              </div>
              <div style={{ fontSize: 13, color: "#86bb9a", letterSpacing: 1, textTransform: "uppercase" }}>
                Mobile App Source · v1.0.0
              </div>
            </div>
          </div>

          {/* File row */}
          <div
            style={{
              background: "rgba(134,187,154,0.08)",
              borderRadius: 10,
              padding: "14px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{FILE_NAME}</div>
              <div style={{ fontSize: 12, color: "#6b9b7e" }}>Expo React Native · All assets included</div>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#86bb9a",
                background: "rgba(134,187,154,0.12)",
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              32 MB
            </div>
          </div>

          {/* Includes list */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#86bb9a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Includes
            </div>
            {[
              "61 locally bundled images (fully offline-ready)",
              "All screens: Home, AI Coach, Chakras, Breathwork",
              "24 yoga poses · 7 chakra guides · 4 journey weeks",
              "app.json · package.json · full source code",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
                <span style={{ color: "#2ecc71", fontSize: 14, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 13, color: "#b8d4c2" }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Setup instructions */}
          <div
            style={{
              background: "rgba(0,0,0,0.25)",
              borderRadius: 8,
              padding: "12px 14px",
              fontSize: 12,
              color: "#6b9b7e",
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#86bb9a" }}>To run after unzipping:</strong>
            <br />
            <code style={{ color: "#86bb9a" }}>pnpm install</code> then{" "}
            <code style={{ color: "#86bb9a" }}>npx expo start</code>
          </div>
        </div>

        {/* URL hint */}
        <p style={{ color: "#2e5c40", fontSize: 11, marginTop: 16, textAlign: "center", fontFamily: "monospace" }}>
          {typeof window !== "undefined" ? window.location.origin + downloadUrl : downloadUrl}
        </p>
      </div>
    </div>
  );
}
