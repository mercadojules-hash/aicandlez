import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Bookmark, ShoppingCart, Clock, Check } from "lucide-react";
import { useWellness } from "@/contexts/WellnessContext";
import { PLANS } from "@/lib/data";
import imgStressRelief from "@assets/natura-plan-stress-relief-v1_1777543715688.webp";
import imgSleepReset from "@assets/natura-plan-sleep-reset-v1_1777543715688.webp";
import imgEnergyBoost from "@assets/natura-plan-energy-boost-v1_1777543715687.webp";

const PLAN_IMAGES: Record<string, string> = {
  "plan-stress-3day": imgStressRelief,
  "plan-sleep-7day":  imgSleepReset,
  "plan-energy-5day": imgEnergyBoost,
};

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const { saveItem, removeItem, isSaved, addToGrocery } = useWellness();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState(0);
  const [heroFailed, setHeroFailed] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const plan = PLANS.find((p) => p.id === id);
  if (!plan) return (
    <div className="detail-screen">
      <button className="back-btn" onClick={() => navigate(-1)}><ChevronLeft size={24} /></button>
      <p style={{ padding: 20 }}>Plan not found.</p>
    </div>
  );

  const saved = isSaved(plan.id);
  const day = plan.days[activeDay] || plan.days[0];
  const heroSrc = PLAN_IMAGES[plan.id] ?? plan.image;

  const toggleActivity = (actId: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.has(actId) ? next.delete(actId) : next.add(actId);
      return next;
    });
  };

  const completedCount = day.activities.filter((a) => completed.has(a.id)).length;
  const totalCount = day.activities.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="detail-screen">
      <div className="detail-hero">
        {!heroFailed && heroSrc ? (
          <img src={heroSrc} alt={plan.title} className="detail-hero-img" onError={() => setHeroFailed(true)} />
        ) : (
          <div className="detail-hero-fallback" />
        )}
        <div className="detail-hero-overlay">
          <div className="detail-hero-top">
            <button className="detail-back-btn" onClick={() => navigate(-1)}>
              <ChevronLeft size={22} color="#fff" />
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="detail-save-btn" onClick={() => addToGrocery(plan.groceryList)}>
                <ShoppingCart size={18} color="#fff" />
              </button>
              <button
                className={`detail-save-btn ${saved ? "saved" : ""}`}
                onClick={() => saved ? removeItem(plan.id) : saveItem({ id: plan.id, type: "plan", title: plan.title, savedAt: new Date().toISOString() })}
              >
                <Bookmark size={18} fill={saved ? "#fff" : "none"} color="#fff" />
              </button>
            </div>
          </div>
          <div className="detail-hero-bottom">
            <span className="detail-hero-category">{plan.goal}</span>
            <h1 className="detail-hero-title">{plan.title}</h1>
          </div>
        </div>
      </div>

      <div className="detail-content">
        <div className="detail-meta">
          <span className="detail-prep"><Clock size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />{plan.duration}</span>
        </div>
        <p className="detail-description">{plan.subtitle}</p>

        {plan.days.length > 1 && (
          <div className="day-tabs">
            {plan.days.map((d, i) => (
              <button
                key={d.day}
                className={`day-tab ${activeDay === i ? "active" : ""}`}
                onClick={() => { setActiveDay(i); setCompleted(new Set()); }}
              >
                Day {d.day}
                <span className="day-tab-label">{d.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">Activities</h3>
          </div>

          <div className="detail-progress-wrap">
            <div className="detail-progress-label">
              <span>Progress</span>
              <span><span>{completedCount}</span> of {totalCount} completed</span>
            </div>
            <div className="detail-progress-track">
              <div className="detail-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {day.activities.map((activity) => {
            const done = completed.has(activity.id);
            return (
              <div
                key={activity.id}
                className={`activity-card ${done ? "done" : ""}`}
                onClick={() => toggleActivity(activity.id)}
              >
                <div className="activity-time-col">
                  <span className="activity-time">{activity.time}</span>
                  <span className={`activity-cat ${activity.category}`}>{activity.category}</span>
                </div>
                <div className="activity-info">
                  <p className="activity-title">{activity.title}</p>
                  <p className="activity-desc">{activity.description}</p>
                  {activity.duration && <p className="activity-dur"><Clock size={11} style={{ display: "inline", marginRight: 3 }} />{activity.duration}</p>}
                </div>
                <div className={`activity-check ${done ? "checked" : ""}`}>
                  {done && <Check size={14} color="#7CFFB2" />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="plan-grid">
          <div className="plan-grid-card">
            <h4 className="plan-grid-title">Foods</h4>
            {day.foods.map((f, i) => <p key={i} className="plan-grid-item">• {f}</p>)}
          </div>
          <div className="plan-grid-card">
            <h4 className="plan-grid-title">Teas</h4>
            {day.teas.map((t, i) => <p key={i} className="plan-grid-item">• {t}</p>)}
          </div>
        </div>

        {day.supplements.length > 0 && (
          <div className="detail-section">
            <h3 className="detail-section-title">Supplements</h3>
            {day.supplements.map((s, i) => (
              <div key={i} className="ingredient-row">
                <div className="ingredient-dot" />
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}

        <div className="detail-section">
          <div className="detail-section-header">
            <h3 className="detail-section-title">Grocery List</h3>
            <button className="guided-btn" onClick={() => addToGrocery(plan.groceryList)}>
              <ShoppingCart size={13} style={{ display: "inline", marginRight: 4 }} />Add all
            </button>
          </div>
          {plan.groceryList.map((item, i) => (
            <div key={i} className="ingredient-row">
              <div className="ingredient-dot" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <button
          className="detail-cta-btn"
          onClick={() => {
            const first = day.activities.find((a) => !completed.has(a.id));
            if (first) toggleActivity(first.id);
          }}
        >
          {completedCount === totalCount && totalCount > 0 ? "Day Complete ✓" : completedCount > 0 ? "Continue Plan" : "Start Session"}
        </button>
      </div>
    </div>
  );
}
