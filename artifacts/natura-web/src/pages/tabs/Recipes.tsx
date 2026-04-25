import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, ShoppingCart, Trash2, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useWellness } from "@/contexts/WellnessContext";
import { RECIPES } from "@/lib/data";

const FILTERS = ["All", "stress", "sleep", "energy", "immunity"] as const;
type Tab = "Recipes" | "Grocery List";

export default function Recipes() {
  const [activeTab, setActiveTab] = useState<Tab>("Recipes");
  const [filter, setFilter] = useState("All");
  const { saveItem, removeItem, isSaved, addToGrocery, groceryList, toggleGroceryItem, clearGroceryChecked } = useWellness();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const filtered = filter === "All" ? RECIPES : RECIPES.filter((r) => r.goal === filter);
  const uncheckedCount = groceryList.filter((g) => !g.checked).length;

  return (
    <Layout>
      <div className="recipes-screen">
        <div className="page-header">
          <h1 className="page-title">Recipes</h1>
          <div className="seg-tabs">
            {(["Recipes", "Grocery List"] as Tab[]).map((tab) => (
              <button key={tab} className={`seg-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab}{tab === "Grocery List" && groceryList.length > 0 ? ` (${uncheckedCount})` : ""}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "Recipes" && (
          <>
            <div className="filter-scroll">
              {FILTERS.map((f) => (
                <button key={f} className={`filter-chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="scroll-view" style={{ paddingTop: 0 }}>
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-title">No recipes found</p>
                </div>
              ) : (
                filtered.map((recipe) => {
                  const saved = isSaved(recipe.id);
                  return (
                    <div key={recipe.id} className="recipe-card" onClick={() => navigate(`${base}/remedy/${recipe.id}`)}>
                      <div className={`recipe-card-img img-${recipe.imageKey}`}>
                        <span className="plan-card-emoji">{recipe.imageKey === "tea" ? "🍵" : recipe.imageKey === "herbs" ? "🌿" : "🥣"}</span>
                      </div>
                      <div className="recipe-card-body">
                        <div className="plan-card-row1">
                          <span className="recipe-goal-badge">{recipe.category} · {recipe.prepTime}</span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="save-btn"
                              onClick={(e) => { e.stopPropagation(); addToGrocery(recipe.groceryList); }}
                              title="Add to grocery list"
                            >
                              <ShoppingCart size={14} color="#6B6B6B" />
                            </button>
                            <button
                              className={`save-btn ${saved ? "saved" : ""}`}
                              onClick={(e) => { e.stopPropagation(); saved ? removeItem(recipe.id) : saveItem({ id: recipe.id, type: "recipe", title: recipe.title, savedAt: new Date().toISOString() }); }}
                            >
                              <Bookmark size={14} fill={saved ? "#3D7A45" : "none"} color={saved ? "#3D7A45" : "#6B6B6B"} />
                            </button>
                          </div>
                        </div>
                        <p className="plan-card-title">{recipe.title}</p>
                        <p className="plan-card-sub">{recipe.description}</p>
                        <span className="recipe-goal-tag">{recipe.goal}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {activeTab === "Grocery List" && (
          <div className="scroll-view" style={{ paddingTop: 0, position: "relative" }}>
            {groceryList.length === 0 ? (
              <div className="empty-state">
                <ShoppingCart size={40} color="#D4CFC5" />
                <p className="empty-title">Your list is empty</p>
                <p className="empty-sub">Tap the cart icon on any recipe to add its ingredients here.</p>
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
