import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Clock, Calendar } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useWellness } from "@/contexts/WellnessContext";
import { PLANS, REMEDIES } from "@/lib/data";
import { CardImage } from "@/components/CardImage";
import { BG, getBackgroundStyle } from "@/lib/background";
import imgStressRelief from "@assets/natura-plan-stress-relief-v1_1777543715688.webp";
import imgSleepReset from "@assets/natura-plan-sleep-reset-v1_1777543715688.webp";
import imgEnergyBoost from "@assets/natura-plan-energy-boost-v1_1777543715687.webp";
import imgGingerTea from "@assets/remedy-ginger-tea_1777546217699.webp";
import imgTurmericMilk from "@assets/remedy-turmeric-golden-milk_1777546217701.webp";
import imgLavenderTea from "@assets/remedy-lavender-calming-tea_1777546217700.webp";
import imgChamomileTea from "@assets/remedy-chamomile-sleep-tea_1777546217699.webp";
import imgEnergySmoothie from "@assets/remedy-green-energy-smoothie_1777546217700.webp";

const PLAN_IMAGES: Record<string, string> = {
  "plan-stress-3day": imgStressRelief,
  "plan-sleep-7day":  imgSleepReset,
  "plan-energy-5day": imgEnergyBoost,
};

const REMEDY_IMAGES: Record<string, string> = {
  "remedy-ginger-tea":       imgGingerTea,
  "remedy-lavender-calm":    imgLavenderTea,
  "remedy-immunity-shot":    imgTurmericMilk,
  "remedy-ashwagandha-milk": imgChamomileTea,
  "remedy-energy-smoothie":  imgEnergySmoothie,
};

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
                  <CardImage src={PLAN_IMAGES[plan.id] ?? plan.image} alt={plan.title} className="plan-card-img" fallbackHint={plan.goal} />
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
                  <CardImage src={REMEDY_IMAGES[remedy.id] ?? remedy.image} alt={remedy.title} className="plan-card-img" fallbackHint={remedy.category} />
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
                          <CardImage src={PLAN_IMAGES[plan.id] ?? plan.image} alt={plan.title} className="plan-card-img" fallbackHint={plan.goal} />
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
                          <CardImage src={REMEDY_IMAGES[remedy.id] ?? remedy.image} alt={remedy.title} className="plan-card-img" fallbackHint={remedy.category} />
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
