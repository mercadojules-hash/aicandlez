import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Bookmark, MessageCircle, List, BookOpen, Check, ShoppingCart, Brain } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";
import { REMEDIES, ROUTINE_TASKS, getTodayTip, getQuickWin } from "@/lib/data";
import { CardImage } from "@/components/CardImage";

const MORNING = ROUTINE_TASKS.filter((t) => t.category === "morning").slice(0, 3);
const AFTERNOON = ROUTINE_TASKS.filter((t) => t.category === "afternoon").slice(0, 2);
const EVENING = ROUTINE_TASKS.filter((t) => t.category === "evening").slice(0, 2);
const ALL_TASKS = [...MORNING, ...AFTERNOON, ...EVENING];

function NaturaLogoSmall() {
  return (
    <svg width="40" height="40" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#EBF5EC" />
      <circle cx="48" cy="48" r="38" fill="#D4EDD6" />
      <path
        d="M48 72C48 72 38 58 38 46C38 38.268 42.477 31.6 48 28C53.523 31.6 58 38.268 58 46C58 58 48 72 48 72Z"
        fill="#3D7A45"
      />
      <line x1="48" y1="50" x2="48" y2="70" stroke="#EBF5EC" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="62" cy="36" r="5" fill="#6BAA4A" />
      <circle cx="62" cy="36" r="2.5" fill="#fff" />
    </svg>
  );
}

export default function Home() {
  const { profile } = useUser();
  const { toggleTask, isTaskDone, streak, saveItem, isSaved } = useWellness();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const [groceryOpen, setGroceryOpen] = useState(false);

  const tip = getTodayTip();
  const quickWin = getQuickWin();
  const completedCount = ALL_TASKS.filter((t) => isTaskDone(t.id)).length;
  const progressPct = ALL_TASKS.length > 0 ? completedCount / ALL_TASKS.length : 0;
  const firstName = profile.name ? profile.name.split(" ")[0] : "Friend";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <Layout>
      <div className="scroll-view">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="home-header">
          <div>
            <p className="greeting-sub">{greeting},</p>
            <p className="greeting-name">{firstName}</p>
          </div>
          <div className="header-logo">
            <NaturaLogoSmall />
          </div>
        </div>

        {streak > 0 && (
          <div className="streak-banner">
            <Zap size={14} color="#6BAA4A" />
            <span>{streak}-day streak! Keep going!</span>
          </div>
        )}

        {/* ── AI Wellness Coach card ───────────────────────────────── */}
        <div className="ai-coach-card">
          <div className="ai-coach-header">
            <div className="ai-coach-avatar">
              <Brain size={20} color="#3D7A45" strokeWidth={1.8} />
            </div>
            <div>
              <p className="ai-coach-title">AI Wellness Coach</p>
              <p className="ai-coach-sub">Personalised guidance for {firstName}</p>
            </div>
          </div>
          <div className="ai-coach-actions">
            <button
              className="ai-coach-btn primary"
              onClick={() => navigate(`${base}/plans`)}
            >
              Today's Plan
            </button>
            <button
              className="ai-coach-btn"
              onClick={() => navigate(`${base}/chat`)}
            >
              Ask AI Coach
            </button>
          </div>
        </div>

        {/* ── Today's Tip ─────────────────────────────────────────── */}
        <div className="tip-card">
          <div className="tip-tag">Today's Tip</div>
          <h3 className="tip-title">{tip.title}</h3>
          <p className="tip-body">{tip.body}</p>
          <div className="quick-win-row">
            <span className="quick-win-label">Quick win:</span>
            <span className="quick-win-text">{quickWin}</span>
          </div>
        </div>

        {/* ── Today's Routine ─────────────────────────────────────── */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Today's Routine</span>
            <span className="section-meta">{completedCount}/{ALL_TASKS.length} done</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct * 100}%` }} />
          </div>
          <div className="task-list">
            {ALL_TASKS.map((task) => {
              const done = isTaskDone(task.id);
              return (
                <button key={task.id} className={`task-item ${done ? "done" : ""}`} onClick={() => toggleTask(task.id)}>
                  <div className={`task-check ${done ? "checked" : ""}`}>
                    {done && <Check size={12} color="#fff" />}
                  </div>
                  <div className="task-info">
                    <span className="task-label">{task.label}</span>
                    {task.time && <span className="task-time">{task.time}</span>}
                  </div>
                  <span className={`task-category ${task.category}`}>{task.category}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Wellness Remedies ────────────────────────────────────── */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Wellness Remedies</span>
            <button className="see-all" onClick={() => navigate(`${base}/plans`)}>See all</button>
          </div>
          <div className="h-scroll">
            {REMEDIES.map((remedy) => {
              const saved = isSaved(remedy.id);
              return (
                <div key={remedy.id} className="remedy-card" onClick={() => navigate(`${base}/remedy/${remedy.id}`)}>
                  <CardImage src={remedy.image} alt={remedy.title} className="remedy-card-img" fallbackHint={remedy.category} />
                  <div className="remedy-card-body">
                    <span className="remedy-card-category">{remedy.category}</span>
                    <p className="remedy-card-title">{remedy.title}</p>
                    <div className="remedy-card-footer">
                      <span className="remedy-card-time">⏱ {remedy.prepTime}</span>
                      <button
                        className={`save-btn ${saved ? "saved" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!saved) saveItem({ id: remedy.id, type: "remedy", title: remedy.title, savedAt: new Date().toISOString() });
                        }}
                      >
                        <Bookmark size={14} fill={saved ? "#3D7A45" : "none"} color={saved ? "#3D7A45" : "#6B6B6B"} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Quick Actions (2×2 grid) ─────────────────────────────── */}
        <div className="section">
          <p className="section-title" style={{ padding: "0 20px", marginBottom: 12 }}>Quick Actions</p>
          <div className="quick-actions-grid">
            {[
              { icon: MessageCircle, label: "Ask AI",    path: "/chat" },
              { icon: List,          label: "My Plans",  path: "/plans" },
              { icon: BookOpen,      label: "Recipes",   path: "/recipes" },
              { icon: ShoppingCart,  label: "Groceries", path: null },
            ].map(({ icon: Icon, label, path }) => (
              <button
                key={label}
                className="quick-action"
                onClick={() => path ? navigate(`${base}${path}`) : setGroceryOpen(true)}
              >
                <div className="qa-icon"><Icon size={20} color="#3D7A45" /></div>
                <span className="qa-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Secondary Grocery Access ─────────────────────────────── */}
        <div className="grocery-prompt">
          <p className="grocery-prompt-text">Need ingredients for your meals?</p>
          <button
            className="grocery-open-btn"
            onClick={() => setGroceryOpen(true)}
          >
            <ShoppingCart size={15} color="#3D7A45" />
            Open Grocery List
          </button>
        </div>

        {/* ── Grocery List Modal ───────────────────────────────────── */}
        {groceryOpen && (
          <div className="grocery-modal-overlay" onClick={() => setGroceryOpen(false)}>
            <div className="grocery-modal" onClick={(e) => e.stopPropagation()}>
              <div className="grocery-modal-header">
                <ShoppingCart size={18} color="#3D7A45" />
                <span>Grocery List</span>
                <button className="grocery-modal-close" onClick={() => setGroceryOpen(false)}>✕</button>
              </div>
              <p className="grocery-modal-sub">Add ingredients from your wellness plans and recipes here.</p>
              <div className="grocery-empty">
                <ShoppingCart size={40} color="#C8D8C9" />
                <p>Your grocery list is empty.</p>
                <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 4 }}>Browse recipes and add ingredients.</p>
                <button
                  className="btn-primary"
                  style={{ marginTop: 20, width: "auto", padding: "12px 28px" }}
                  onClick={() => { setGroceryOpen(false); navigate(`${base}/recipes`); }}
                >
                  Browse Recipes
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </Layout>
  );
}
