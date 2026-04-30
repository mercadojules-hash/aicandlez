import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Clock, Calendar } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useWellness } from "@/contexts/WellnessContext";
import { PLANS, REMEDIES } from "@/lib/data";
import { CardImage } from "@/components/CardImage";
import { BG, getBackgroundStyle } from "@/lib/background";

type Tab = "Plans" | "Remedies" | "Saved";

export default function Plans() {
  const [activeTab, setActiveTab] = useState<Tab>("Plans");
  const { saveItem, removeItem, isSaved, savedItems } = useWellness();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const savedPlans = savedItems.filter((s) => s.type === "plan");
  const savedRemedies = savedItems.filter((s) => s.type === "remedy");

  return (
    <Layout bgStyle={getBackgroundStyle(BG.main2)}>
      <div className="scroll-view" style={{ background: "transparent" }}>
        <div className="page-header">
          <h1 className="page-title">Wellness Plans</h1>
          <div className="seg-tabs">
            {(["Plans", "Remedies", "Saved"] as Tab[]).map((tab) => (
              <button key={tab} className={`seg-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab}{tab === "Saved" && savedItems.length > 0 ? ` (${savedItems.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "Plans" && (
          <>
            <p className="section-label">Curated wellness programs to support your goals</p>
            {PLANS.map((plan) => {
              const saved = isSaved(plan.id);
              return (
                <div key={plan.id} className="plan-card" onClick={() => navigate(`${base}/plan/${plan.id}`)}>
                  <CardImage src={plan.image} alt={plan.title} className="plan-card-img" fallbackHint={plan.goal} />
                  <div className="plan-card-body">
                    <div className="plan-card-row1">
                      <span className="plan-goal-badge">{plan.goal}</span>
                      <button
                        className={`save-btn ${saved ? "saved" : ""}`}
                        onClick={(e) => { e.stopPropagation(); saved ? removeItem(plan.id) : saveItem({ id: plan.id, type: "plan", title: plan.title, savedAt: new Date().toISOString() }); }}
                      >
                        <Bookmark size={16} fill={saved ? "#3D7A45" : "none"} color={saved ? "#3D7A45" : "#6B6B6B"} />
                      </button>
                    </div>
                    <p className="plan-card-title">{plan.title}</p>
                    <p className="plan-card-sub">{plan.subtitle}</p>
                    <div className="plan-card-meta">
                      <span><Calendar size={12} style={{ display: "inline", marginRight: 4 }} />{plan.duration}</span>
                      <span><Clock size={12} style={{ display: "inline", marginRight: 4 }} />{plan.days.length} day{plan.days.length > 1 ? "s" : ""} included</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {activeTab === "Remedies" && (
          <>
            <p className="section-label">Natural remedy guides with step-by-step instructions</p>
            {REMEDIES.map((remedy) => {
              const saved = isSaved(remedy.id);
              return (
                <div key={remedy.id} className="plan-card" onClick={() => navigate(`${base}/remedy/${remedy.id}`)}>
                  <CardImage src={remedy.image} alt={remedy.title} className="plan-card-img" fallbackHint={remedy.category} />
                  <div className="plan-card-body">
                    <div className="plan-card-row1">
                      <span className="plan-goal-badge">{remedy.category}</span>
                      <button
                        className={`save-btn ${saved ? "saved" : ""}`}
                        onClick={(e) => { e.stopPropagation(); saved ? removeItem(remedy.id) : saveItem({ id: remedy.id, type: "remedy", title: remedy.title, savedAt: new Date().toISOString() }); }}
                      >
                        <Bookmark size={16} fill={saved ? "#3D7A45" : "none"} color={saved ? "#3D7A45" : "#6B6B6B"} />
                      </button>
                    </div>
                    <p className="plan-card-title">{remedy.title}</p>
                    <p className="plan-card-sub">{remedy.description}</p>
                    <span className="plan-card-meta"><Clock size={12} style={{ display: "inline", marginRight: 4 }} />{remedy.prepTime}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {activeTab === "Saved" && (
          <>
            {savedItems.length === 0 ? (
              <div className="empty-state">
                <Bookmark size={40} color="#D4CFC5" />
                <p className="empty-title">Nothing saved yet</p>
                <p className="empty-sub">Bookmark remedies and plans to find them here quickly.</p>
              </div>
            ) : (
              <>
                {savedPlans.length > 0 && (
                  <>
                    <p className="saved-group-label">Plans</p>
                    {savedPlans.map((s) => {
                      const plan = PLANS.find((p) => p.id === s.id);
                      if (!plan) return null;
                      return (
                        <div key={plan.id} className="plan-card" onClick={() => navigate(`${base}/plan/${plan.id}`)}>
                          <CardImage src={plan.image} alt={plan.title} className="plan-card-img" fallbackHint={plan.goal} />
                          <div className="plan-card-body">
                            <span className="plan-goal-badge">{plan.goal}</span>
                            <p className="plan-card-title">{plan.title}</p>
                            <p className="plan-card-sub">{plan.subtitle}</p>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {savedRemedies.length > 0 && (
                  <>
                    <p className="saved-group-label">Remedies</p>
                    {savedRemedies.map((s) => {
                      const remedy = REMEDIES.find((r) => r.id === s.id);
                      if (!remedy) return null;
                      return (
                        <div key={remedy.id} className="plan-card" onClick={() => navigate(`${base}/remedy/${remedy.id}`)}>
                          <CardImage src={remedy.image} alt={remedy.title} className="plan-card-img" fallbackHint={remedy.category} />
                          <div className="plan-card-body">
                            <span className="plan-goal-badge">{remedy.category}</span>
                            <p className="plan-card-title">{remedy.title}</p>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
