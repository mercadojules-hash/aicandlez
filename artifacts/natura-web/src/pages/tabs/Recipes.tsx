import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, ShoppingCart, Trash2, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { getBackgroundStyle, BG } from "@/lib/background";
import { useWellness } from "@/contexts/WellnessContext";
import { RECIPES } from "@/lib/data";

import imgTurmeric  from "@assets/remedy-turmeric-golden-milk_1777546217701.webp";
import imgGinger    from "@assets/remedy-ginger-tea_1777546217699.webp";
import imgSmoothie  from "@assets/remedy-green-energy-smoothie_1777546217700.webp";
import imgStress    from "@assets/natura-plan-stress-relief-v1_1777543715688.webp";

const RECIPE_IMAGES: Record<string, string> = {
  "recipe-golden-milk":    imgTurmeric,
  "recipe-immunity-broth": imgGinger,
  "recipe-overnight-oats": imgSmoothie,
  "recipe-antistress-salad": imgStress,
};

const GOAL_COLORS: Record<string, string> = {
  immunity: "#4CAF7D",
  energy:   "#9FE870",
  stress:   "#F5A623",
  sleep:    "#8B7FD4",
};

const FILTERS = ["All", "stress", "sleep", "energy", "immunity"] as const;
type Tab = "Recipes" | "Grocery List";

export default function Recipes() {
  const [activeTab, setActiveTab] = useState<Tab>("Recipes");
  const [filter, setFilter]       = useState("All");
  const { saveItem, removeItem, isSaved, addToGrocery, groceryList, toggleGroceryItem, clearGroceryChecked } = useWellness();
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

                  return (
                    <div
                      key={recipe.id}
                      className="recipe-feature-card"
                      onClick={() => navigate(`${base}/remedy/${recipe.id}`)}
                    >
                      {/* Image hero */}
                      <div
                        className="recipe-card-hero"
                        style={{
                          backgroundImage: img
                            ? `linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.55)),
                               radial-gradient(circle at top right, rgba(120,255,180,0.12), transparent 60%),
                               url(${img})`
                            : `linear-gradient(135deg, rgba(20,80,50,0.9), rgba(10,40,25,0.95))`,
                          backgroundSize:     "cover",
                          backgroundPosition: "center",
                        }}
                      >
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

                      {/* Card body */}
                      <div className="recipe-card-body">
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
