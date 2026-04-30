import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Bookmark, Check, ChevronRight, Sparkles } from "lucide-react";
import { useWellness } from "@/contexts/WellnessContext";
import { usePremium } from "@/contexts/PremiumContext";
import { REMEDIES, RECIPES } from "@/lib/data";
import imgGingerTea      from "@assets/remedy-ginger-tea_1777546217699.webp";
import imgTurmericMilk   from "@assets/remedy-turmeric-golden-milk_1777546217701.webp";
import imgLavenderTea    from "@assets/remedy-lavender-calming-tea_1777546217700.webp";
import imgChamomileTea   from "@assets/remedy-chamomile-sleep-tea_1777546217699.webp";
import imgEnergySmoothie from "@assets/remedy-green-energy-smoothie_1777546217700.webp";
import imgStressRelief   from "@assets/natura-plan-stress-relief-v1_1777543715688.webp";

import imgSleepBanana     from "@assets/recipe-sleep-banana-magnesium-smoothie_1777562671039.webp";
import imgSleepChamomile  from "@assets/recipe-sleep-chamomile-honey-night-tea_1777562671040.webp";
import imgSleepGoldenRest from "@assets/recipe-sleep-golden-milk-rest_1777562671040.webp";
import imgSleepLavender   from "@assets/recipe-sleep-lavender-chamomile-tea_1777562671040.webp";
import imgSleepMoonMilk   from "@assets/sleep-cinnamon-moon-milk-v1_1777562671040.webp";

import imgEnergyChocolate from "@assets/energy-chocolate-coffee-protein-smoothie-v1_1777562671037.webp";
import imgEnergyCitrus    from "@assets/energy-citrus-green-juice-v1._1777562671037.webp";
import imgEnergyMatcha    from "@assets/energy-green-matcha-detox-smoothie-v1_1777562671038.webp";
import imgEnergyTurmeric  from "@assets/energy-turmeric-ginger-lemon-elixir-v1_1777562671038.webp";
import imgEnergyBowl      from "@assets/energy-superfood-green-smoothie-bowl-v1_1777562671038.webp";

import imgDigFennel       from "@assets/natura-digestion-fennel-bloating-relief-tea-v1_1777562671039.webp";
import imgDigGinger       from "@assets/digestion-soothing-ginger-tea-v1_1777562671037.webp";
import imgDigPeppermint   from "@assets/digestion-peppermint-relief-tea-v1_1777562671037.webp";
import imgDigChamomile    from "@assets/natura-digestion-chamomile-bloating-relief-tea-v1_1777562671038.webp";
import imgDigProbiotic    from "@assets/natura-digestion-green-probiotic-smoothie-v1_1777562671039.webp";

import imgStressChamomile    from "@assets/stress-chamomile-lemon-calm-tea-v1_1777562707376.webp";
import imgStressLavender     from "@assets/stress-lavender-chamomile-relax-tea-v1_1777562707376.webp";
import imgStressChocolate    from "@assets/stress-dark-chocolate-energy-bites-v1_1777562707376.webp";
import imgStressAdaptogen    from "@assets/stress-turmeric-adaptogen-latte-v1_1777562707376.webp";
import imgStressAshwagandha  from "@assets/stress-ashwagandha-calm-latte-v1_1777562707375.webp";
import imgStressOatBites     from "@assets/stress-oat-lavender-energy-bites-v1_1777562707376.webp";

const DETAIL_IMAGES: Record<string, string> = {
  "remedy-ginger-tea":           imgGingerTea,
  "remedy-lavender-calm":        imgLavenderTea,
  "remedy-immunity-shot":        imgTurmericMilk,
  "remedy-ashwagandha-milk":     imgChamomileTea,
  "remedy-energy-smoothie":      imgEnergySmoothie,
  "recipe-golden-milk":          imgTurmericMilk,
  "recipe-immunity-broth":       imgGingerTea,
  "recipe-immunity-elderberry":  imgGingerTea,
  "recipe-immunity-citrus-shot": imgTurmericMilk,
  "recipe-immunity-green-bowl":  imgEnergyBowl,
  "recipe-overnight-oats":       imgEnergySmoothie,
  "recipe-energy-citrus":        imgEnergyCitrus,
  "recipe-energy-matcha":        imgEnergyMatcha,
  "recipe-energy-turmeric":      imgEnergyTurmeric,
  "recipe-energy-chocolate":     imgEnergyChocolate,
  "recipe-antistress-salad":     imgStressRelief,
  "recipe-stress-chamomile":     imgStressChamomile,
  "recipe-stress-lavender":      imgStressLavender,
  "recipe-stress-chocolate":     imgStressChocolate,
  "recipe-stress-adaptogen":     imgStressAdaptogen,
  "recipe-stress-ashwagandha":   imgStressAshwagandha,
  "recipe-stress-oat-bites":     imgStressOatBites,
  "recipe-sleep-chamomile":      imgSleepChamomile,
  "recipe-sleep-lavender":       imgSleepLavender,
  "recipe-sleep-golden-rest":    imgSleepGoldenRest,
  "recipe-sleep-banana":         imgSleepBanana,
  "recipe-sleep-moon-milk":      imgSleepMoonMilk,
  "recipe-digestion-fennel":     imgDigFennel,
  "recipe-digestion-ginger":     imgDigGinger,
  "recipe-digestion-peppermint": imgDigPeppermint,
  "recipe-digestion-chamomile":  imgDigChamomile,
  "recipe-digestion-probiotic":  imgDigProbiotic,
};

export default function RemedyDetail() {
  const { id } = useParams<{ id: string }>();
  const { saveItem, removeItem, isSaved } = useWellness();
  const { isPremium } = usePremium();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [stepMode, setStepMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [heroFailed, setHeroFailed] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const item = REMEDIES.find((r) => r.id === id) || RECIPES.find((r) => r.id === id);
  if (!item) return (
    <div className="detail-screen">
      <button className="back-btn" onClick={() => navigate(-1)}><ChevronLeft size={24} /></button>
      <p style={{ padding: 20 }}>Item not found.</p>
    </div>
  );

  const saved = isSaved(item.id);
  const isRecipe = "variations" in item;
  const heroSrc = DETAIL_IMAGES[item.id] ?? item.image;
  const bgImg   = DETAIL_IMAGES[item.id] ?? item.image;

  const toggleStep = (idx: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
    setActiveStep(idx + 1 < item.steps.length ? idx + 1 : idx);
  };

  const enterGuidedMode = () => {
    setCurrentStep(0);
    setStepMode(true);
  };

  return (
    <div
      className="detail-screen"
      style={{
        backgroundImage: bgImg
          ? `linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.85) 100%),
             radial-gradient(circle at top right, rgba(120,255,180,0.15), transparent 60%),
             url(${bgImg})`
          : undefined,
        backgroundSize:     "cover",
        backgroundPosition: "center top",
        backgroundAttachment: "local",
      }}
    >
      <div className="detail-hero">
        {!heroFailed && heroSrc ? (
          <img src={heroSrc} alt={item.title} className="detail-hero-img" onError={() => setHeroFailed(true)} />
        ) : (
          <div className="detail-hero-fallback" />
        )}
        <div className="detail-hero-overlay">
          <div className="detail-hero-top">
            <button className="detail-back-btn" onClick={() => navigate(-1)}>
              <ChevronLeft size={22} color="#fff" />
            </button>
            <button
              className={`detail-save-btn ${saved ? "saved" : ""}`}
              onClick={() => saved ? removeItem(item.id) : saveItem({ id: item.id, type: isRecipe ? "recipe" : "remedy", title: item.title, savedAt: new Date().toISOString() })}
            >
              <Bookmark size={18} fill={saved ? "#fff" : "none"} color="#fff" />
            </button>
          </div>
          <div className="detail-hero-bottom">
            <span className="detail-hero-category">{item.category}</span>
            <h1 className="detail-hero-title">{item.title}</h1>
          </div>
        </div>
      </div>

      <div className="detail-content">
        <div className="detail-meta">
          <span className="detail-prep">⏱ {item.prepTime}</span>
        </div>
        <p className="detail-description">{item.description}</p>

        {!stepMode ? (
          <>
            {/* Ingredients */}
            <div className="detail-section">
              <h3 className="detail-section-title">Ingredients</h3>
              {item.ingredients.map((ing, i) => (
                <div key={i} className="ingredient-row">
                  <div className="ingredient-dot" />
                  <span>{ing}</span>
                </div>
              ))}
            </div>

            {/* Steps — progression system */}
            <div className="detail-section">
              <div className="detail-section-header">
                <h3 className="detail-section-title">Steps</h3>
                <button className="guided-btn" onClick={enterGuidedMode}>
                  <Sparkles size={12} style={{ display: "inline", marginRight: 4 }} />
                  Guided
                </button>
              </div>
              <div className="steps-track">
                {item.steps.map((step, idx) => {
                  const done = completedSteps.has(idx);
                  const isActive = activeStep === idx && !done;
                  return (
                    <div
                      key={step.stepNumber}
                      className={`step-row ${isActive ? "active" : ""} ${done ? "done" : ""}`}
                      onClick={() => toggleStep(idx)}
                    >
                      <div className="step-col">
                        <div className={`step-num ${done ? "done" : isActive ? "active" : ""}`}>
                          {done ? <Check size={13} color="#7CFFB2" /> : step.stepNumber}
                        </div>
                        {idx < item.steps.length - 1 && (
                          <div className={`step-connector ${done ? "done" : ""}`} />
                        )}
                      </div>
                      <div className="step-body">
                        <p className="step-instruction">{step.instruction}</p>
                        {step.duration && <p className="step-duration">⏱ {step.duration}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Benefits */}
            {"benefits" in item && (
              <div className="detail-section">
                <h3 className="detail-section-title">Benefits</h3>
                {item.benefits.map((b, i) => (
                  <div key={i} className="benefit-row">
                    <span className="benefit-check"><Check size={13} color="#7CFFB2" /></span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Variations */}
            {isRecipe && (
              <div className="detail-section">
                <h3 className="detail-section-title">Variations</h3>
                {(item as any).variations.map((v: string, i: number) => (
                  <div key={i} className="ingredient-row">
                    <div className="ingredient-dot" style={{ background: "#9FE870" }} />
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Safety note */}
            <div className="safety-card">
              <p className="safety-title">⚠️ Safety Note</p>
              <p className="safety-text">{"safetyNote" in item ? item.safetyNote : ""}</p>
            </div>

            {isRecipe && !isPremium && (
              <div className="recipe-upsell-card">
                <p className="recipe-upsell-title">Want more like this?</p>
                <p className="recipe-upsell-sub">
                  Unlock the full Natura experience — 50+ premium recipes, guided wellness plans, and daily routines.
                </p>
                <button className="recipe-upsell-btn" onClick={() => navigate(`${base}/upgrade`)}>
                  Unlock Full Library
                </button>
              </div>
            )}

            <button className="detail-cta-btn" onClick={enterGuidedMode}>
              <Sparkles size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
              Start Guided Mode
            </button>
          </>
        ) : (
          /* ─── Guided mode ─── */
          <div className="guided-mode">
            <div className="guided-header">
              <p className="guided-count">Step {currentStep + 1} <span style={{ color: "rgba(255,255,255,0.4)" }}>of {item.steps.length}</span></p>
              <button className="guided-exit" onClick={() => setStepMode(false)}>Exit</button>
            </div>

            {/* Dot indicators */}
            <div className="guided-dots">
              {item.steps.map((_, i) => (
                <button
                  key={i}
                  className={`guided-dot ${i === currentStep ? "active" : ""} ${i < currentStep ? "done" : ""}`}
                  onClick={() => setCurrentStep(i)}
                />
              ))}
            </div>

            <div className="guided-progress">
              <div className="guided-progress-fill" style={{ width: `${((currentStep + 1) / item.steps.length) * 100}%` }} />
            </div>

            <div className="guided-step-card">
              <div className="guided-step-num">{currentStep + 1}</div>
              <p className="guided-step-instruction">{item.steps[currentStep].instruction}</p>
              {item.steps[currentStep].duration && (
                <p className="guided-step-duration">⏱ {item.steps[currentStep].duration}</p>
              )}
            </div>

            <div className="guided-nav">
              <button
                className="guided-nav-btn"
                onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                disabled={currentStep === 0}
              >
                <ChevronLeft size={20} />
                Previous
              </button>
              {currentStep < item.steps.length - 1 ? (
                <button className="guided-nav-btn primary" onClick={() => setCurrentStep((s) => s + 1)}>
                  Next Step
                  <ChevronRight size={20} />
                </button>
              ) : (
                <button className="guided-nav-btn primary" onClick={() => setStepMode(false)}>
                  <Check size={18} />
                  Complete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
