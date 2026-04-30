import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Clock, Star, Check, ShoppingCart, Leaf, Sun, Moon, Coffee } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";
import { ROUTINE_TASKS, getTodayTip } from "@/lib/data";
import { BG, getBackgroundStyle } from "@/lib/background";

const MORNING   = ROUTINE_TASKS.filter((t) => t.category === "morning").slice(0, 3);
const AFTERNOON = ROUTINE_TASKS.filter((t) => t.category === "afternoon").slice(0, 2);
const EVENING   = ROUTINE_TASKS.filter((t) => t.category === "evening").slice(0, 2);
const ALL_TASKS = [...MORNING, ...AFTERNOON, ...EVENING];

function NaturaLogoSmall() {
  return (
    <div className="home-logo-wrap">
      <svg width="36" height="36" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M48 76C48 76 34 58 34 44C34 34.059 40.268 25.6 48 22C55.732 25.6 62 34.059 62 44C62 58 48 76 48 76Z"
          fill="#7CFFB2"
        />
        <path
          d="M48 76C48 76 34 58 34 44C34 34.059 40.268 25.6 48 22C55.732 25.6 62 34.059 62 44C62 58 48 76 48 76Z"
          fill="url(#logoGrad)"
        />
        <line x1="48" y1="52" x2="48" y2="74" stroke="rgba(7,27,19,0.5)" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="64" cy="34" r="6" fill="#5CEBA0" />
        <circle cx="64" cy="34" r="3" fill="rgba(255,255,255,0.9)" />
        <defs>
          <linearGradient id="logoGrad" x1="34" y1="22" x2="62" y2="76" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7CFFB2" />
            <stop offset="100%" stopColor="#3DE892" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function UserAvatar({ name }: { name: string }) {
  const initial = name ? name[0].toUpperCase() : "U";
  return (
    <div className="home-avatar">
      <svg viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r="28" fill="#142A1C" />
        <circle cx="28" cy="21" r="10" fill="#7CFFB2" opacity="0.85" />
        <ellipse cx="28" cy="44" rx="16" ry="11" fill="#7CFFB2" opacity="0.45" />
      </svg>
      <span className="home-avatar-initial">{initial}</span>
    </div>
  );
}

function ProgressRing({ score }: { score: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <svg width="104" height="104" viewBox="0 0 104 104">
      <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(124,255,178,0.1)" strokeWidth="9" />
      <circle
        cx="52" cy="52" r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="9"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 52 52)"
        style={{ transition: "stroke-dashoffset 1.2s ease", filter: "drop-shadow(0 0 6px rgba(124,255,178,0.55))" }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5CEBA0" />
          <stop offset="100%" stopColor="#7CFFB2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function TrendGraph() {
  const pts = [38, 48, 44, 58, 54, 66, 74];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const W = 84, H = 32;
  const coords = pts.map((p, i) =>
    `${(i / (pts.length - 1)) * W},${H - ((p - min) / (max - min || 1)) * H}`
  ).join(" ");
  const lastX = W;
  const lastY = H - ((pts[pts.length - 1] - min) / (max - min || 1)) * H;
  return (
    <svg width={W} height={H + 4} style={{ overflow: "visible" }}>
      <polyline points={coords} fill="none" stroke="#7CFFB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <circle cx={lastX} cy={lastY} r="3.5" fill="#7CFFB2" style={{ filter: "drop-shadow(0 0 4px #7CFFB2)" }} />
    </svg>
  );
}

function TaskIcon({ category }: { category: string }) {
  const size = 15;
  const color = "#7CFFB2";
  if (category === "morning") return <Sun size={size} color={color} />;
  if (category === "evening") return <Moon size={size} color={color} />;
  return <Coffee size={size} color={color} />;
}

export default function Home() {
  const { profile } = useUser();
  const { toggleTask, isTaskDone, streak, addToGrocery, groceryList, toggleGroceryItem, clearGroceryChecked } = useWellness();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [groceryOpen, setGroceryOpen] = useState(false);

  const tip = getTodayTip();
  const completedCount = ALL_TASKS.filter((t) => isTaskDone(t.id)).length;
  const progressPct = ALL_TASKS.length > 0 ? completedCount / ALL_TASKS.length : 0;
  const firstName = profile.name ? profile.name.split(" ")[0] : "Jules";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const wellnessScore = Math.min(95, 60 + Math.round(progressPct * 20) + Math.min((streak || 0) * 2, 15));
  const displayStreak = streak > 0 ? streak : 5;

  return (
    <Layout bgStyle={getBackgroundStyle(BG.main1)}>
      <div className="scroll-view home-scroll" style={{ background: "transparent" }}>

        {/* ── 1. HERO ──────────────────────────────────────────────── */}
        <div className="home-hero">
          <div className="home-hero-glow" />
          <div className="home-hero-glow-left" />
          <div className="home-hero-top">
            <div className="home-hero-left">
              <p className="home-greeting-sub">{greeting}, {firstName}</p>
              <h1 className="home-hero-title">Today's Plan for You</h1>
              <p className="home-hero-subtitle">Personalized steps for your mind, body and energy</p>
            </div>
            <div className="home-hero-right">
              <NaturaLogoSmall />
              <UserAvatar name={firstName} />
            </div>
          </div>
          <div className="home-energy-badge">
            <Zap size={12} color="#7CFFB2" fill="#7CFFB2" />
            <span>Energy: Good</span>
          </div>
        </div>

        {/* ── 2. STATS BAR ─────────────────────────────────────────── */}
        <div className="home-stats-bar">
          {[
            { icon: <Zap size={16} color="#7CFFB2" fill="#7CFFB2" />, value: `${displayStreak}`, label: "day streak" },
            { icon: <Clock size={16} color="#7CFFB2" />,              value: "32",               label: "min today"  },
            { icon: <Check size={16} color="#7CFFB2" />,              value: `${completedCount}`, label: "sessions"  },
            { icon: <Star size={16}  color="#7CFFB2" fill="#7CFFB2" />, value: `${wellnessScore}`, label: "score"   },
          ].map(({ icon, value, label }, i) => (
            <div key={i} className="home-stat-item">
              <div className="home-stat-icon">{icon}</div>
              <span className="home-stat-value">{value}</span>
              <span className="home-stat-label">{label}</span>
            </div>
          ))}
        </div>

        {/* ── 3. TODAY'S PLAN (TIMELINE) ───────────────────────────── */}
        <div className="home-section">
          <div className="home-section-header">
            <span className="home-section-title">Today's Plan</span>
            <span className="home-section-meta">{completedCount}/{ALL_TASKS.length} done</span>
          </div>
          <div className="home-progress-bar">
            <div className="home-progress-fill" style={{ width: `${progressPct * 100}%` }} />
          </div>
          <div className="home-timeline">
            {ALL_TASKS.map((task) => {
              const done = isTaskDone(task.id);
              return (
                <div key={task.id} className="home-tl-item">
                  <div className="home-tl-left">
                    {task.time && <span className="home-tl-time">{task.time}</span>}
                    <div className={`home-tl-dot ${done ? "done" : ""}`} />
                  </div>
                  <button
                    className={`home-tl-card ${done ? "done" : ""}`}
                    onClick={() => toggleTask(task.id)}
                  >
                    <div className="home-tl-icon-wrap">
                      <TaskIcon category={task.category} />
                    </div>
                    <div className="home-tl-info">
                      <p className="home-tl-label">{task.label}</p>
                      <p className="home-tl-sub">{task.category}{task.time ? ` · ${task.time}` : ""}</p>
                    </div>
                    <div className={`home-tl-check ${done ? "checked" : ""}`}>
                      {done && <Check size={11} color="#071B13" />}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 4. PROGRESS CARD ────────────────────────────────────── */}
        <div className="home-progress-card">
          <div className="home-ring-wrap">
            <ProgressRing score={wellnessScore} />
            <div className="home-ring-center">
              <span className="home-ring-score">{wellnessScore}</span>
              <span className="home-ring-label">Wellness</span>
            </div>
          </div>
          <div className="home-progress-info">
            <TrendGraph />
            <p className="home-progress-headline">You're doing great!</p>
            <p className="home-progress-body">Keep going, small steps create big changes.</p>
            <div className="home-progress-tip">
              <Leaf size={12} color="#7CFFB2" />
              <span>{tip.title}</span>
            </div>
          </div>
        </div>

        {/* ── 5. CTA ───────────────────────────────────────────────── */}
        <div className="home-cta-card">
          <div className="home-cta-glow" />
          <p className="home-cta-label">Need guidance?</p>
          <button
            className="home-cta-btn"
            onClick={() => navigate(`${base}/chat`)}
          >
            Ask AI anything
            <span className="home-cta-arrow">→</span>
          </button>
        </div>

        <div style={{ height: 24 }} />

        {/* ── Grocery Modal ─────────────────────────────────────── */}
        {groceryOpen && (
          <div className="grocery-modal-overlay" onClick={() => setGroceryOpen(false)}>
            <div className="grocery-modal" onClick={(e) => e.stopPropagation()}>
              <div className="grocery-modal-header">
                <ShoppingCart size={18} color="#3D7A45" />
                <span>Grocery List</span>
                <button className="grocery-modal-close" onClick={() => setGroceryOpen(false)}>&#x2715;</button>
              </div>
              {groceryList.length === 0 ? (
                <div className="grocery-empty">
                  <ShoppingCart size={40} color="#C8D8C9" />
                  <p>Your grocery list is empty.</p>
                  <button
                    className="btn-primary"
                    style={{ marginTop: 20, width: "auto", padding: "12px 28px" }}
                    onClick={() => { setGroceryOpen(false); navigate(`${base}/recipes`); }}
                  >
                    Browse Recipes
                  </button>
                </div>
              ) : (
                <div style={{ padding: "0 20px 20px" }}>
                  {groceryList.map((item) => (
                    <button key={item.id} className={`task-item ${item.checked ? "done" : ""}`} onClick={() => toggleGroceryItem(item.id)}>
                      <div className={`task-check ${item.checked ? "checked" : ""}`}>
                        {item.checked && <Check size={12} color="#fff" />}
                      </div>
                      <span className="task-label" style={{ textDecoration: item.checked ? "line-through" : "none" }}>{item.name}</span>
                    </button>
                  ))}
                  {groceryList.some((g) => g.checked) && (
                    <button className="clear-btn" onClick={clearGroceryChecked}>Clear checked</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
