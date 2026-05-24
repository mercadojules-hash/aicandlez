import { TRADE_PORTAL_URL } from "../../lib/appUrls";

function PhoneMockup({
  screen,
  label,
  offset = 0,
}: {
  screen: React.ReactNode;
  label: string;
  offset?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        transform: `translateY(${offset}px)`,
      }}
    >
      <div
        style={{
          width: 220,
          background: "#0a0a0a",
          borderRadius: 36,
          border: "1px solid rgba(255,255,255,0.12)",
          padding: "10px 8px",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.8), 0 0 40px rgba(0,229,255,0.06)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 80,
            height: 26,
            background: "#0a0a0a",
            borderRadius: "0 0 16px 16px",
            margin: "0 auto 6px",
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 40, height: 4, background: "#222", borderRadius: 2 }} />
        </div>
        <div
          style={{
            background: "#000",
            borderRadius: 26,
            overflow: "hidden",
            minHeight: 380,
            position: "relative",
          }}
        >
          {screen}
        </div>
        <div
          style={{
            width: 60,
            height: 4,
            background: "#222",
            borderRadius: 2,
            margin: "8px auto 0",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#647385",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: "var(--app-font-mono)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function SignalScreen() {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "#000" }}>
      <div style={{ fontSize: 11, color: "#647385", fontFamily: "var(--app-font-mono)", marginBottom: 4 }}>01:13 — LIVE</div>
      <div
        style={{
          background: "rgba(0,255,136,0.08)",
          border: "1px solid rgba(0,255,136,0.2)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>BTC/USD</span>
          <span
            style={{
              background: "rgba(0,255,136,0.15)",
              color: "#00ff88",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            BUY
          </span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#00ff88", marginBottom: 2 }}>87%</div>
        <div style={{ fontSize: 10, color: "#647385" }}>AI CONFIDENCE</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {["RSI: 42", "EMA ↑", "VOL +34%"].map((t) => (
            <span key={t} style={{ fontSize: 10, color: "#00e5ff", background: "rgba(0,229,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "rgba(0,229,255,0.06)",
          border: "1px solid rgba(0,229,255,0.15)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>ETH/USD</span>
          <span style={{ fontSize: 11, background: "rgba(0,255,136,0.1)", color: "#00ff88", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>BUY</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#00e5ff" }}>79%</div>
        <div style={{ fontSize: 10, color: "#647385" }}>CONFIDENCE</div>
      </div>

      <div
        style={{
          background: "rgba(13,21,30,0.8)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#8892a4" }}>SOL/USD</span>
          <span style={{ fontSize: 11, background: "rgba(0,229,255,0.08)", color: "#00e5ff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>HOLD</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#8892a4" }}>61%</div>
        <div style={{ fontSize: 10, color: "#647385" }}>BELOW THRESHOLD</div>
      </div>

      <div
        style={{
          background: "rgba(0,255,136,0.05)",
          border: "1px solid rgba(0,255,136,0.12)",
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 11,
          color: "#8892a4",
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: "#00e5ff", fontWeight: 700 }}>AI:</span>{" "}
        Placing BTC bracket order — SL 2%, TP 4%...
        <span className="animate-blink" style={{ color: "#00e5ff" }}>_</span>
      </div>
    </div>
  );
}

function PortfolioScreen() {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "#000" }}>
      <div style={{ fontSize: 10, color: "#647385", fontFamily: "var(--app-font-mono)", marginBottom: 2 }}>PORTFOLIO</div>
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>$103,241</div>
        <div style={{ fontSize: 13, color: "#00ff88", marginTop: 4 }}>+$3,241 (+3.24%)</div>
        <div style={{ fontSize: 10, color: "#647385", marginTop: 2 }}>All time return</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "Open Trades", value: "3", color: "#00e5ff" },
          { label: "Today PnL", value: "+$824", color: "#00ff88" },
          { label: "Win Rate", value: "78.4%", color: "#9b5cf5" },
          { label: "Avg Return", value: "+2.1%", color: "#ffd200" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "rgba(13,21,30,0.8)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: 10,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 9, color: "#647385", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 10, color: "#8892a4", marginBottom: 8, fontWeight: 600 }}>OPEN POSITIONS</div>
        {[
          { symbol: "BTC/USD", pnl: "+$521", pct: "+0.62%", up: true },
          { symbol: "ETH/USD", pnl: "+$203", pct: "+0.41%", up: true },
          { symbol: "SOL/USD", pnl: "+$100", pct: "+1.24%", up: true },
        ].map((pos) => (
          <div
            key={pos.symbol}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "7px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{pos.symbol}</span>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: pos.up ? "#00ff88" : "#ff4466" }}>{pos.pnl}</div>
              <div style={{ fontSize: 10, color: pos.up ? "#00ff88" : "#ff4466" }}>{pos.pct}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertScreen() {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "#000" }}>
      <div style={{ fontSize: 10, color: "#647385", fontFamily: "var(--app-font-mono)", marginBottom: 2 }}>NOTIFICATIONS</div>

      {[
        {
          type: "TRADE EXECUTED",
          msg: "BUY BTC/USD filled @ $94,312",
          time: "1m ago",
          color: "#00ff88",
          icon: "⚡",
          unread: true,
        },
        {
          type: "AI SIGNAL",
          msg: "ETH/USD confidence spike — 79% BUY",
          time: "3m ago",
          color: "#00e5ff",
          icon: "🧠",
          unread: true,
        },
        {
          type: "TAKE PROFIT HIT",
          msg: "SOL/USD closed +$204 (+4.2%)",
          time: "12m ago",
          color: "#ffd200",
          icon: "✓",
          unread: false,
        },
        {
          type: "RISK ALERT",
          msg: "Portfolio exposure approaching 30%",
          time: "28m ago",
          color: "#9b5cf5",
          icon: "🛡️",
          unread: false,
        },
        {
          type: "TRADE EXECUTED",
          msg: "BUY AVAX/USD filled @ $42.50",
          time: "1h ago",
          color: "#00ff88",
          icon: "⚡",
          unread: false,
        },
      ].map((notif, i) => (
        <div
          key={i}
          style={{
            background: notif.unread ? "rgba(0,229,255,0.05)" : "rgba(13,21,30,0.6)",
            border: `1px solid ${notif.unread ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.04)"}`,
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 14, paddingTop: 1 }}>{notif.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: notif.color, fontWeight: 700, letterSpacing: "0.08em" }}>{notif.type}</span>
              <span style={{ fontSize: 9, color: "#647385" }}>{notif.time}</span>
            </div>
            <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.4 }}>{notif.msg}</div>
          </div>
          {notif.unread && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e5ff", flexShrink: 0, marginTop: 4 }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function MobileShowcase() {
  return (
    <section
      style={{
        padding: "120px 24px",
        background: "linear-gradient(180deg, #000 0%, #020810 50%, #000 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.02) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 900,
          height: 600,
          background: "radial-gradient(ellipse, rgba(0,229,255,0.06) 0%, rgba(155,92,245,0.04) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <div className="section-label" style={{ marginBottom: 20, display: "inline-flex" }}>
            Mobile App
          </div>
          <h2
            style={{
              fontSize: "clamp(32px, 4vw, 56px)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: 20,
            }}
          >
            Trading Intelligence
            <br />
            <span className="gradient-text">in Your Pocket</span>
          </h2>
          <p style={{ color: "#8892a4", fontSize: 17, maxWidth: 520, margin: "0 auto 20px" }}>
            The full AICandlez platform — signals, portfolio, autonomous trading,
            and real-time notifications — optimized for iOS and Android.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={TRADE_PORTAL_URL} className="btn-primary" style={{ padding: "10px 24px", fontSize: 14 }}>
              Open as PWA
            </a>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 18px",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 13,
                color: "#647385",
              }}
            >
              iOS App — Coming Soon
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 32,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
          className="phone-row"
        >
          <PhoneMockup screen={<SignalScreen />} label="AI Signals" offset={-20} />
          <PhoneMockup screen={<PortfolioScreen />} label="Portfolio" offset={20} />
          <PhoneMockup screen={<AlertScreen />} label="Live Alerts" offset={-10} />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 40,
            marginTop: 64,
            flexWrap: "wrap",
          }}
        >
          {[
            { icon: "📲", label: "Install as PWA", desc: "Add to home screen on any device" },
            { icon: "🔔", label: "Real-time Alerts", desc: "Instant trade & signal notifications" },
            { icon: "🌐", label: "Works Offline", desc: "Core UI available without connection" },
            { icon: "⚡", label: "Sub-100ms UI", desc: "OLED-optimized, 60fps smooth" },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center", maxWidth: 160 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "#647385", lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .phone-row > * + * { display: none; }
        }
      `}</style>
    </section>
  );
}
