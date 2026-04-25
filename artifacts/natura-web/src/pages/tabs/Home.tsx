import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Bookmark, ArrowRight, MessageCircle, List, BookOpen, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";
import { REMEDIES, ROUTINE_TASKS, getTodayTip, getQuickWin } from "@/lib/data";

const MORNING = ROUTINE_TASKS.filter((t) => t.category === "morning").slice(0, 3);
const AFTERNOON = ROUTINE_TASKS.filter((t) => t.category === "afternoon").slice(0, 2);
const EVENING = ROUTINE_TASKS.filter((t) => t.category === "evening").slice(0, 2);
const ALL_TASKS = [...MORNING, ...AFTERNOON, ...EVENING];

export default function Home() {
  const { profile } = useUser();
  const { toggleTask, isTaskDone, streak, saveItem, isSaved } = useWellness();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

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
        <div className="home-header">
          <div>
            <p className="greeting-sub">{greeting},</p>
            <p className="greeting-name">{firstName}</p>
          </div>
          <div className="header-logo">
            <span style={{ fontSize: 28 }}>🌿</span>
          </div>
        </div>

        {streak > 0 && (
          <div className="streak-banner">
            <Zap size={16} color="#6BAA4A" />
            <span>{streak}-day streak! Keep going!</span>
          </div>
        )}

        <div className="tip-card">
          <div className="tip-tag">Today's Tip</div>
          <h3 className="tip-title">{tip.title}</h3>
          <p className="tip-body">{tip.body}</p>
          <div className="quick-win-row">
            <span className="quick-win-label">Quick win:</span>
            <span className="quick-win-text">{quickWin}</span>
          </div>
        </div>

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
                  <div className={`remedy-card-img img-${remedy.imageKey}`}>
                    <span className="remedy-card-emoji">{remedy.imageKey === "tea" ? "🍵" : remedy.imageKey === "herbs" ? "🌿" : "🥣"}</span>
                  </div>
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

        <div className="section">
          <p className="section-title" style={{ marginBottom: 14 }}>Quick Actions</p>
          <div className="quick-actions">
            {[
              { icon: MessageCircle, label: "Ask AI", path: "/chat" },
              { icon: List, label: "My Plans", path: "/plans" },
              { icon: BookOpen, label: "Recipes", path: "/recipes" },
            ].map(({ icon: Icon, label, path }) => (
              <button key={label} className="quick-action" onClick={() => navigate(`${base}${path}`)}>
                <div className="qa-icon"><Icon size={20} color="#3D7A45" /></div>
                <span className="qa-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
