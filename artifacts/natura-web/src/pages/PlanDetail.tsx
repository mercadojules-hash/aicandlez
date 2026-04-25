import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Bookmark, ShoppingCart, Clock } from "lucide-react";
import { useWellness } from "@/contexts/WellnessContext";
import { PLANS } from "@/lib/data";

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const { saveItem, removeItem, isSaved, addToGrocery } = useWellness();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState(0);

  const plan = PLANS.find((p) => p.id === id);
  if (!plan) return (
    <div className="detail-screen">
      <button className="back-btn" onClick={() => navigate(-1)}><ChevronLeft size={24} /></button>
      <p style={{ padding: 20 }}>Plan not found.</p>
    </div>
  );

  const saved = isSaved(plan.id);
  const day = plan.days[activeDay] || plan.days[0];

  return (
    <div className="detail-screen">
      <div className={`detail-hero img-${plan.imageKey}`}>
        <div className="detail-hero-overlay">
          <button className="detail-back-btn" onClick={() => navigate(-1)}>
            <ChevronLeft size={24} color="#fff" />
          </button>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="detail-save-btn" onClick={() => addToGrocery(plan.groceryList)}>
              <ShoppingCart size={20} color="#fff" />
            </button>
            <button
              className="detail-save-btn"
              onClick={() => saved ? removeItem(plan.id) : saveItem({ id: plan.id, type: "plan", title: plan.title, savedAt: new Date().toISOString() })}
            >
              <Bookmark size={20} fill={saved ? "#fff" : "none"} color="#fff" />
            </button>
          </div>
        </div>
        <div className="detail-hero-content">
          <span className="detail-hero-emoji">{plan.imageKey === "tea" ? "🍵" : plan.imageKey === "herbs" ? "🌿" : "🥣"}</span>
        </div>
      </div>

      <div className="detail-content">
        <div className="detail-meta">
          <span className="detail-category">{plan.goal}</span>
          <span className="detail-prep">{plan.duration}</span>
        </div>
        <h1 className="detail-title">{plan.title}</h1>
        <p className="detail-description">{plan.subtitle}</p>

        {plan.days.length > 1 && (
          <div className="day-tabs">
            {plan.days.map((d, i) => (
              <button
                key={d.day}
                className={`day-tab ${activeDay === i ? "active" : ""}`}
                onClick={() => setActiveDay(i)}
              >
                Day {d.day}
                <span className="day-tab-label">{d.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="detail-section">
          <h3 className="detail-section-title">Activities</h3>
          {day.activities.map((activity) => (
            <div key={activity.id} className="activity-card">
              <div className="activity-time-col">
                <span className="activity-time">{activity.time}</span>
                <span className={`activity-cat ${activity.category}`}>{activity.category}</span>
              </div>
              <div className="activity-info">
                <p className="activity-title">{activity.title}</p>
                <p className="activity-desc">{activity.description}</p>
                {activity.duration && <p className="activity-dur"><Clock size={12} style={{ display: "inline", marginRight: 4 }} />{activity.duration}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="plan-grid">
          <div className="plan-grid-card">
            <h4 className="plan-grid-title">🥗 Foods</h4>
            {day.foods.map((f, i) => <p key={i} className="plan-grid-item">• {f}</p>)}
          </div>
          <div className="plan-grid-card">
            <h4 className="plan-grid-title">🍵 Teas</h4>
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
              <ShoppingCart size={14} style={{ display: "inline", marginRight: 4 }} />Add all
            </button>
          </div>
          {plan.groceryList.map((item, i) => (
            <div key={i} className="ingredient-row">
              <div className="ingredient-dot" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
