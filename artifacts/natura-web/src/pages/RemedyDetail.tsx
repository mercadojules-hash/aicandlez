import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Bookmark, Check, ChevronRight, ChevronDown } from "lucide-react";
import { useWellness } from "@/contexts/WellnessContext";
import { REMEDIES, RECIPES } from "@/lib/data";

export default function RemedyDetail() {
  const { id } = useParams<{ id: string }>();
  const { saveItem, removeItem, isSaved } = useWellness();
  const navigate = useNavigate();
  const [stepMode, setStepMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [heroFailed, setHeroFailed] = useState(false);

  const item = REMEDIES.find((r) => r.id === id) || RECIPES.find((r) => r.id === id);
  if (!item) return (
    <div className="detail-screen">
      <button className="back-btn" onClick={() => navigate(-1)}><ChevronLeft size={24} /></button>
      <p style={{ padding: 20 }}>Item not found.</p>
    </div>
  );

  const saved = isSaved(item.id);
  const isRecipe = "variations" in item;

  return (
    <div className="detail-screen">
      <div className="detail-hero">
        {!heroFailed && item.image ? (
          <img
            src={item.image}
            alt={item.title}
            className="detail-hero-img"
            onError={() => setHeroFailed(true)}
          />
        ) : (
          <div className="detail-hero-fallback" />
        )}
        <div className="detail-hero-overlay">
          <button className="detail-back-btn" onClick={() => navigate(-1)}>
            <ChevronLeft size={24} color="#fff" />
          </button>
          <button
            className="detail-save-btn"
            onClick={() => saved ? removeItem(item.id) : saveItem({ id: item.id, type: isRecipe ? "recipe" : "remedy", title: item.title, savedAt: new Date().toISOString() })}
          >
            <Bookmark size={20} fill={saved ? "#fff" : "none"} color="#fff" />
          </button>
        </div>
      </div>

      <div className="detail-content">
        <div className="detail-meta">
          <span className="detail-category">{item.category}</span>
          <span className="detail-prep">&#x23F1; {item.prepTime}</span>
        </div>
        <h1 className="detail-title">{item.title}</h1>
        <p className="detail-description">{item.description}</p>

        {!stepMode ? (
          <>
            <div className="detail-section">
              <h3 className="detail-section-title">Ingredients</h3>
              {item.ingredients.map((ing, i) => (
                <div key={i} className="ingredient-row">
                  <div className="ingredient-dot" />
                  <span>{ing}</span>
                </div>
              ))}
            </div>

            <div className="detail-section">
              <div className="detail-section-header">
                <h3 className="detail-section-title">Steps</h3>
                <button className="guided-btn" onClick={() => setStepMode(true)}>Guided mode</button>
              </div>
              {item.steps.map((step) => (
                <div key={step.stepNumber} className="step-row">
                  <div className="step-num">{step.stepNumber}</div>
                  <div>
                    <p className="step-instruction">{step.instruction}</p>
                    {step.duration && <p className="step-duration">&#x23F1; {step.duration}</p>}
                  </div>
                </div>
              ))}
            </div>

            {"benefits" in item && (
              <div className="detail-section">
                <h3 className="detail-section-title">Benefits</h3>
                {item.benefits.map((b, i) => (
                  <div key={i} className="benefit-row">
                    <Check size={14} color="#3D7A45" />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            )}

            {isRecipe && (
              <div className="detail-section">
                <h3 className="detail-section-title">Variations</h3>
                {(item as any).variations.map((v: string, i: number) => (
                  <div key={i} className="ingredient-row">
                    <div className="ingredient-dot" style={{ background: "#6BAA4A" }} />
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="safety-card">
              <p className="safety-title">Safety Note</p>
              <p className="safety-text">{"safetyNote" in item ? item.safetyNote : ""}</p>
            </div>
          </>
        ) : (
          <div className="guided-mode">
            <div className="guided-header">
              <p className="guided-count">Step {currentStep + 1} of {item.steps.length}</p>
              <button className="guided-exit" onClick={() => setStepMode(false)}>Exit guided mode</button>
            </div>
            <div className="guided-progress">
              <div className="guided-progress-fill" style={{ width: `${((currentStep + 1) / item.steps.length) * 100}%` }} />
            </div>
            <div className="guided-step-card">
              <div className="guided-step-num">{currentStep + 1}</div>
              <p className="guided-step-instruction">{item.steps[currentStep].instruction}</p>
              {item.steps[currentStep].duration && (
                <p className="guided-step-duration">&#x23F1; {item.steps[currentStep].duration}</p>
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
                  Next
                  <ChevronRight size={20} />
                </button>
              ) : (
                <button className="guided-nav-btn primary" onClick={() => setStepMode(false)}>
                  <Check size={20} />
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
