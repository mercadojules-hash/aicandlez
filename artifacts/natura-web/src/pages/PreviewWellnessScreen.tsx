import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, MessageCircle, List, BookOpen, User, Flame, Clock,
  CheckCircle2, Star, ChevronRight, Zap, TrendingUp, Leaf
} from "lucide-react";

/* ─── tiny sparkline ────────────────────────────────────────────── */
function Sparkline() {
  const pts = [40, 55, 45, 65, 58, 72, 68, 80, 74, 86];
  const w = 100, h = 40;
  const min = Math.min(...pts), max = Math.max(...pts);
  const norm = (v: number) => h - ((v - min) / (max - min)) * (h - 6) - 3;
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * w},${norm(v)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 40 }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7CFFB2" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7CFFB2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#sg)" />
      <path d={d} fill="none" stroke="#7CFFB2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── circular progress ──────────────────────────────────────────── */
function CircleProgress({ value, max = 100 }: { value: number; max?: number }) {
  const r = 38, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const pct = value / max;
  const dash = pct * circ;
  return (
    <svg viewBox="0 0 88 88" style={{ width: 88, height: 88 }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke="#7CFFB2" strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        filter="url(#glow)"
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">{value}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8">score</text>
    </svg>
  );
}

/* ─── timeline items ─────────────────────────────────────────────── */
const TIMELINE = [
  { time: "7:00 AM",  icon: Leaf,          label: "Green Energy Matcha",    sub: "Remedy · 5 min",       color: "#7CFFB2" },
  { time: "8:00 AM",  icon: Flame,          label: "Adaptogenic Oats Bowl",  sub: "Recipe · 10 min",      color: "#FFC46B" },
  { time: "12:30 PM", icon: Zap,            label: "10-min walk",            sub: "Action · 10 min",      color: "#6BD4FF" },
  { time: "7:30 PM",  icon: Star,           label: "Evening mindfulness",    sub: "Mindfulness · 15 min", color: "#C46BFF" },
];

/* ─── bottom tabs ────────────────────────────────────────────────── */
const TABS = [
  { icon: Home,          label: "Home" },
  { icon: MessageCircle, label: "Ask AI" },
  { icon: List,          label: "Plans",   active: true },
  { icon: BookOpen,      label: "Recipes" },
  { icon: User,          label: "Profile" },
];

/* ═══════════════════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════════════════════ */
export default function PreviewWellnessScreen() {
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);

  return (
    <div className="pw-root">
      <div className="pw-scroll">

        {/* ── HEADER ──────────────────────────────────────────────── */}
        <div className={`pw-fade ${mounted ? "pw-in" : ""}`} style={{ transitionDelay: "0ms" }}>
          <div className="pw-header">
            <div>
              <p className="pw-greeting">Good evening, Jules 👋</p>
              <h1 className="pw-title">Today's Plan for You</h1>
              <p className="pw-subtitle">Personalized steps for your mind, body, and energy</p>
            </div>
            <div className="pw-logo-ring">
              <svg width="46" height="46" viewBox="0 0 96 96" fill="none">
                <circle cx="48" cy="48" r="48" fill="rgba(124,255,178,0.12)" />
                <path d="M48 72C48 72 38 58 38 46C38 38.268 42.477 31.6 48 28C53.523 31.6 58 38.268 58 46C58 58 48 72 48 72Z" fill="#7CFFB2" />
                <line x1="48" y1="50" x2="48" y2="70" stroke="rgba(7,27,19,0.6)" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx="62" cy="36" r="5" fill="#4ead7c" />
                <circle cx="62" cy="36" r="2.5" fill="#fff" />
              </svg>
            </div>
          </div>

          {/* Energy badge */}
          <div className="pw-badge-row">
            <div className="pw-badge">
              <Zap size={13} color="#7CFFB2" />
              <span>Energy — Good</span>
            </div>
          </div>
        </div>

        {/* ── STATS ROW ───────────────────────────────────────────── */}
        <div className={`pw-fade ${mounted ? "pw-in" : ""}`} style={{ transitionDelay: "80ms" }}>
          <div className="pw-stats-row">
            {[
              { icon: Flame,        val: "5",    unit: "day streak" },
              { icon: Clock,        val: "32",   unit: "min today" },
              { icon: CheckCircle2, val: "3",    unit: "sessions" },
              { icon: Star,         val: "86",   unit: "score" },
            ].map(({ icon: Icon, val, unit }) => (
              <div key={unit} className="pw-stat-card">
                <Icon size={16} color="#7CFFB2" />
                <p className="pw-stat-val">{val}</p>
                <p className="pw-stat-unit">{unit}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── TIMELINE ────────────────────────────────────────────── */}
        <div className={`pw-fade ${mounted ? "pw-in" : ""}`} style={{ transitionDelay: "160ms" }}>
          <p className="pw-section-label">Your Day</p>
          <div className="pw-timeline">
            {TIMELINE.map((item, i) => {
              const Icon = item.icon;
              const isLast = i === TIMELINE.length - 1;
              return (
                <div key={item.time} className="pw-tl-row">
                  {/* Left column: time + line */}
                  <div className="pw-tl-left">
                    <p className="pw-tl-time">{item.time}</p>
                    <div className="pw-tl-node" style={{ boxShadow: `0 0 8px ${item.color}` }}>
                      <div className="pw-tl-dot" style={{ background: item.color }} />
                    </div>
                    {!isLast && <div className="pw-tl-line" />}
                  </div>
                  {/* Right column: card */}
                  <div className="pw-tl-card" style={{ borderColor: `${item.color}22` }}>
                    <div className="pw-tl-icon" style={{ background: `${item.color}18`, border: `1px solid ${item.color}33` }}>
                      <Icon size={16} color={item.color} />
                    </div>
                    <div className="pw-tl-text">
                      <p className="pw-tl-label">{item.label}</p>
                      <p className="pw-tl-sub">{item.sub}</p>
                    </div>
                    <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── PROGRESS SECTION ────────────────────────────────────── */}
        <div className={`pw-fade ${mounted ? "pw-in" : ""}`} style={{ transitionDelay: "240ms" }}>
          <p className="pw-section-label">Wellness Score</p>
          <div className="pw-progress-card">
            <div className="pw-progress-left">
              <CircleProgress value={86} />
              <p className="pw-progress-title">Wellness Score</p>
            </div>
            <div className="pw-progress-right">
              <div className="pw-sparkline-wrap">
                <Sparkline />
              </div>
              <p className="pw-progress-quote">
                You're doing great! Keep going — small steps create big changes.
              </p>
              <div className="pw-trend-row">
                <TrendingUp size={13} color="#7CFFB2" />
                <span>+4 pts this week</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ─────────────────────────────────────────────────── */}
        <div className={`pw-fade ${mounted ? "pw-in" : ""}`} style={{ transitionDelay: "300ms" }}>
          <div className="pw-cta-card">
            <div>
              <p className="pw-cta-title">Need guidance?</p>
              <p className="pw-cta-sub">Your AI wellness coach is ready</p>
            </div>
            <button
              className="pw-cta-btn"
              onClick={() => navigate(`${base}/chat`)}
            >
              <MessageCircle size={16} color="#071B13" />
              Ask AI anything
            </button>
          </div>
        </div>

        <div style={{ height: 90 }} />
      </div>

      {/* ── BOTTOM NAV ──────────────────────────────────────────── */}
      <nav className="pw-nav">
        {TABS.map(({ icon: Icon, label, active }) => (
          <button key={label} className={`pw-nav-tab ${active ? "active" : ""}`}>
            <div className={`pw-nav-icon ${active ? "active" : ""}`}>
              <Icon size={20} color={active ? "#7CFFB2" : "rgba(255,255,255,0.35)"} />
            </div>
            <span className={`pw-nav-label ${active ? "active" : ""}`}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
