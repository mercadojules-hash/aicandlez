import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, ShoppingCart, Trash2, Check, Lock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { getBackgroundStyle, BG } from "@/lib/background";
import { useWellness } from "@/contexts/WellnessContext";
import { usePremium } from "@/contexts/PremiumContext";
import { RECIPES } from "@/lib/data";

import imgTurmeric        from "@assets/remedy-turmeric-golden-milk_1777546217701.webp";
import imgGinger          from "@assets/remedy-ginger-tea_1777546217699.webp";
import imgSmoothie        from "@assets/remedy-green-energy-smoothie_1777546217700.webp";
import imgStress          from "@assets/natura-plan-stress-relief-v1_1777543715688.webp";

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

const RECIPE_IMAGES: Record<string, string> = {
  "recipe-golden-milk":         imgTurmeric,
  "recipe-immunity-broth":      imgGinger,
  "recipe-immunity-elderberry":  imgGinger,
  "recipe-immunity-citrus-shot": imgTurmeric,
  "recipe-immunity-green-bowl":  imgEnergyBowl,
  "recipe-overnight-oats":      imgSmoothie,
  "recipe-energy-citrus":        imgEnergyCitrus,
  "recipe-energy-matcha":        imgEnergyMatcha,
  "recipe-energy-turmeric":      imgEnergyTurmeric,
  "recipe-energy-chocolate":     imgEnergyChocolate,
  "recipe-antistress-salad":    imgStress,
  "recipe-stress-chamomile":    imgStressChamomile,
  "recipe-stress-lavender":     imgStressLavender,
  "recipe-stress-chocolate":    imgStressChocolate,
  "recipe-stress-adaptogen":    imgStressAdaptogen,
  "recipe-stress-ashwagandha":  imgStressAshwagandha,
  "recipe-stress-oat-bites":    imgStressOatBites,
  "recipe-sleep-chamomile":     imgSleepChamomile,
  "recipe-sleep-lavender":      imgSleepLavender,
  "recipe-sleep-golden-rest":   imgSleepGoldenRest,
  "recipe-sleep-banana":        imgSleepBanana,
  "recipe-sleep-moon-milk":     imgSleepMoonMilk,
  "recipe-digestion-fennel":    imgDigFennel,
  "recipe-digestion-ginger":    imgDigGinger,
  "recipe-digestion-peppermint": imgDigPeppermint,
  "recipe-digestion-chamomile":  imgDigChamomile,
  "recipe-digestion-probiotic":  imgDigProbiotic,
};

const GOAL_COLORS: Record<string, string> = {
  immunity:  "#4CAF7D",
  energy:    "#9FE870",
  stress:    "#F5A623",
  sleep:     "#8B7FD4",
  digestion: "#45B7AA",
};

const FILTERS = ["All", "sleep", "stress", "energy", "digestion", "immunity"] as const;
type Tab = "Recipes" | "Grocery List";

const FREE_RECIPE_IDS = new Set([
  "recipe-golden-milk",
  "recipe-immunity-broth",
  "recipe-overnight-oats",
  "recipe-energy-citrus",
  "recipe-antistress-salad",
  "recipe-stress-chamomile",
  "recipe-sleep-chamomile",
  "recipe-sleep-lavender",
  "recipe-digestion-ginger",
  "recipe-digestion-peppermint",
]);

export default function Recipes() {
  const [activeTab, setActiveTab] = useState<Tab>("Recipes");
  const [filter, setFilter]       = useState("All");
  const { saveItem, removeItem, isSaved, addToGrocery, groceryList, toggleGroceryItem, clearGroceryChecked } = useWellness();
  const { isPremium } = usePremium();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const filtered = filter === "All" ? RECIPES : RECIPES.filter((r) => r.goal === filter);
  const uncheckedCount = groceryList.filter((g) => !g.checked).length;

  return (
    <Layout bgStyle={getBackgroundStyle(BG.calm)}>
      <div className="recipes-screen">

        {/* Header */}
        <div className="recipes-header">
          <h1 className="recipes-page-title">Recipes</h1>
          <div className="seg-tabs">
            {(["Recipes", "Grocery List"] as Tab[]).map((tab) => (
              <button key={tab} className={`seg-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab}{tab === "Grocery List" && groceryList.length > 0 ? ` (${uncheckedCount})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* ── RECIPES TAB ── */}
        {activeTab === "Recipes" && (
          <>
            <div className="filter-scroll" style={{ padding: "0 16px 14px" }}>
              {FILTERS.map((f) => (
                <button key={f} className={`filter-chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="recipe-list">
              {filtered.length === 0 ? (
                <div className="recipe-empty-state">
                  <span className="recipe-empty-icon">🍃</span>
                  <p className="recipe-empty-title">No recipes found</p>
                  <p className="recipe-empty-sub">Try a different filter</p>
                </div>
              ) : (
                filtered.map((recipe) => {
                  const saved     = isSaved(recipe.id);
                  const img       = RECIPE_IMAGES[recipe.id];
                  const goalColor = GOAL_COLORS[recipe.goal] ?? "#7CFFB2";
                  const isLocked  = !isPremium && !FREE_RECIPE_IDS.has(recipe.id);

                  return (
                    <div
                      key={recipe.id}
                      className="recipe-feature-card"
                      onClick={() => isLocked ? navigate(`${base}/upgrade`) : navigate(`${base}/remedy/${recipe.id}`)}
                    >
                      <div
                        className="recipe-card-hero"
                        style={{
                          backgroundImage: img
                            ? `linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.88) 100%),
                               radial-gradient(circle at top right, rgba(120,255,180,0.12), transparent 60%),
                               url(${img})`
                            : `linear-gradient(135deg, rgba(20,80,50,0.9), rgba(10,40,25,0.95))`,
                          backgroundSize:     "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        {isLocked && (
                          <div className="recipe-locked-overlay">
                            <div className="recipe-locked-icon">
                              <Lock size={16} color="#9FE870" />
                            </div>
                            <p className="recipe-locked-label">Premium Recipe</p>
                            <p className="recipe-locked-sub">Unlock to access</p>
                            <button className="recipe-locked-btn" onClick={(e) => { e.stopPropagation(); navigate(`${base}/upgrade`); }}>
                              Upgrade
                            </button>
                          </div>
                        )}
                        {/* top row: badge + actions */}
                        <div className="recipe-hero-top">
                          <span
                            className="recipe-hero-badge"
                            style={{ color: goalColor, background: goalColor + "22", borderColor: goalColor + "55" }}
                          >
                            {recipe.category.toUpperCase()}
                          </span>
                          <div className="recipe-hero-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="recipe-hero-btn"
                              title="Add to grocery list"
                              onClick={(e) => { e.stopPropagation(); addToGrocery(recipe.groceryList); }}
                            >
                              <ShoppingCart size={15} color="rgba(255,255,255,0.85)" />
                            </button>
                            <button
                              className={`recipe-hero-btn ${saved ? "saved" : ""}`}
                              title={saved ? "Saved" : "Save recipe"}
                              onClick={(e) => { e.stopPropagation(); saved ? removeItem(recipe.id) : saveItem({ id: recipe.id, type: "recipe", title: recipe.title, savedAt: new Date().toISOString() }); }}
                            >
                              <Bookmark size={15} fill={saved ? "#7CFFB2" : "none"} color={saved ? "#7CFFB2" : "rgba(255,255,255,0.85)"} />
                            </button>
                          </div>
                        </div>

                        {/* bottom row: meta + title + desc ON the image */}
                        <div className="recipe-hero-bottom">
                          <div className="recipe-card-meta">
                            <span className="recipe-time-badge">⏱ {recipe.prepTime}</span>
                            <span
                              className="recipe-goal-pill"
                              style={{ color: goalColor, background: goalColor + "18", borderColor: goalColor + "44" }}
                            >
                              {recipe.goal}
                            </span>
                          </div>
                          <p className="recipe-card-title">{recipe.title}</p>
                          <p className="recipe-card-desc">{recipe.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── GROCERY LIST TAB ── */}
        {activeTab === "Grocery List" && (
          <div className="scroll-view" style={{ paddingTop: 0, position: "relative" }}>
            {groceryList.length === 0 ? (
              <div className="grocery-empty-state">
                <div className="grocery-empty-icon-wrap">
                  <ShoppingCart size={32} color="#7CFFB2" />
                </div>
                <p className="grocery-empty-title">Your list is empty</p>
                <p className="grocery-empty-sub">Add ingredients from any recipe</p>
              </div>
            ) : (
              <>
                {groceryList.map((item) => (
                  <button key={item.id} className={`task-item ${item.checked ? "done" : ""}`} onClick={() => toggleGroceryItem(item.id)}>
                    <div className={`task-check ${item.checked ? "checked" : ""}`}>
                      {item.checked && <Check size={12} color="#fff" />}
                    </div>
                    <span className="task-label" style={{ textDecoration: item.checked ? "line-through" : "none" }}>{item.name}</span>
                  </button>
                ))}
                {groceryList.some((g) => g.checked) && (
                  <button className="clear-btn" onClick={clearGroceryChecked}>
                    <Trash2 size={14} color="#E53E3E" />
                    <span>Clear checked</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
