const V3_FILE = "natura-yoga-ai-v1.0.0-v3.zip";
const V2_FILE = "natura-yoga-ai-v1.0.0-v2.zip";
const V1_FILE = "natura-yoga-ai-v1.0.0.zip";

export default function Download() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const v3Url = `${base}/${V3_FILE}`;

  console.log("Download URL (v3):", window.location.origin + v3Url);

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

        {/* ── PRIMARY DOWNLOAD BUTTON — v3 at very top ── */}
        <a
          href={v3Url}
          download={V3_FILE}
          style={{
            display: "block",
            padding: "22px 24px",
            background: "#2ecc71",
            color: "#fff",
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            borderRadius: 12,
            marginBottom: 8,
            textDecoration: "none",
            boxShadow: "0 4px 24px rgba(46,204,113,0.45)",
            letterSpacing: 0.2,
          }}
        >
          ⬇ Download Natura Yoga AI (v1.0.0 v3)
        </a>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <span style={{ color: "#4a7a5a", fontSize: 12, fontFamily: "monospace" }}>
            {V3_FILE} · 31 MB · 61 images · 131 files · integrity verified
          </span>
        </div>

        {/* Details card */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(134,187,154,0.2)",
            borderRadius: 16,
            padding: "28px",
            color: "#e8f5ee",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "linear-gradient(135deg, #3d9e6a, #86bb9a)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, flexShrink: 0,
              }}
            >🌿</div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 2 }}>Natura Yoga AI</div>
              <div style={{ fontSize: 12, color: "#86bb9a", letterSpacing: 1, textTransform: "uppercase" }}>
                Expo React Native · v1.0.0 v3 · App Store Ready
              </div>
            </div>
          </div>

          {/* What's fixed in v3 */}
          <div
            style={{
              background: "rgba(46,204,113,0.08)",
              border: "1px solid rgba(46,204,113,0.2)",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "#2ecc71", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              What's new in v3
            </div>
            {[
              "No catalog: or workspace: references — works with npm install",
              "All external image URLs replaced with local assets",
              "app.json: slug & scheme set to natura-yoga-ai",
              "iOS bundleIdentifier: com.julesmercado.naturayogaai",
              "iOS buildNumber: 4",
              "Yoga screen image source fixed (was broken)",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                <span style={{ color: "#2ecc71", fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: "#b8d4c2" }}>{item}</span>
              </div>
            ))}
          </div>

          {/* All included assets */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#86bb9a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Included assets (61 images)
            </div>
            {[
              "24 yoga pose images (webp)",
              "14 chakra images — 7 symbols + 7 crystals",
              "7 chakra yoga pose images",
              "3 home slides + 3 breathwork screens",
              "AI coach, logo variants, splash, app icon",
              "4 journey week cover images",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                <span style={{ color: "#86bb9a", fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: "#b8d4c2" }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Setup */}
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
            <code style={{ color: "#86bb9a" }}>npm install</code> then{" "}
            <code style={{ color: "#86bb9a" }}>npx expo start</code>
          </div>
        </div>

        {/* Previous versions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { file: V2_FILE, label: "v2", base },
            { file: V1_FILE, label: "v1 (original)", base },
          ].map(({ file, label }) => (
            <a
              key={file}
              href={`${base}/${file}`}
              download={file}
              style={{
                flex: 1,
                display: "block",
                padding: "10px",
                background: "rgba(134,187,154,0.06)",
                border: "1px solid rgba(134,187,154,0.15)",
                color: "#6b9b7e",
                textAlign: "center",
                fontSize: 12,
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              {label}
            </a>
          ))}
        </div>

        <p style={{ color: "#2e5c40", fontSize: 11, textAlign: "center", fontFamily: "monospace", margin: 0 }}>
          {typeof window !== "undefined" ? window.location.origin + v3Url : v3Url}
        </p>
      </div>
    </div>
  );
}
