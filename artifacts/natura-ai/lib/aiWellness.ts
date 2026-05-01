export interface AIIngredient { name: string; explanation: string; safetyNote: string; }
export interface AIResponse { herbs: AIIngredient[]; teas: AIIngredient[]; foods: AIIngredient[]; supplements: AIIngredient[]; whyItHelps: string; query: string; }

const DB: Record<string, AIResponse> = {
  stress: {
    query: "stress",
    herbs: [
      { name: "Ashwagandha", explanation: "Traditionally used as an adaptogen that may help the body adapt to stress.", safetyNote: "Consult a healthcare provider if pregnant or on thyroid medication." },
      { name: "Holy Basil (Tulsi)", explanation: "Traditionally used to support a calm, focused state.", safetyNote: "May interact with blood-thinning medications." },
    ],
    teas: [
      { name: "Chamomile Tea", explanation: "Contains apigenin, which may support relaxation.", safetyNote: "Avoid if you have ragweed allergies." },
      { name: "Lavender Tea", explanation: "May support a calm, settled feeling.", safetyNote: "Avoid in large amounts during pregnancy." },
    ],
    foods: [
      { name: "Dark Chocolate (70%+)", explanation: "Rich in magnesium and flavonoids that may support calmer mood.", safetyNote: "Enjoy in moderation. Contains caffeine." },
      { name: "Blueberries", explanation: "Antioxidant-rich berries that may help protect against oxidative stress.", safetyNote: "Safe for daily use." },
    ],
    supplements: [
      { name: "Magnesium Glycinate", explanation: "May support muscle relaxation and a calm nervous system.", safetyNote: "Consult a healthcare provider for proper dosage." },
      { name: "L-Theanine", explanation: "An amino acid found in green tea that may support relaxed alertness.", safetyNote: "Consult a healthcare provider if combining with medications." },
    ],
    whyItHelps: "These suggestions may support the body's natural stress-response system. Adaptogenic herbs, relaxing teas, and magnesium-rich foods have been traditionally used to promote balance.",
  },
  sleep: {
    query: "sleep",
    herbs: [
      { name: "Valerian Root", explanation: "Traditionally used to support restful sleep.", safetyNote: "Avoid combining with alcohol or sleep medications." },
      { name: "Passionflower", explanation: "Traditionally used to ease an overactive mind before sleep.", safetyNote: "Avoid during pregnancy." },
    ],
    teas: [
      { name: "Lemon Balm Tea", explanation: "A calming herb that may support a quieter mind.", safetyNote: "May interact with thyroid medications." },
      { name: "Chamomile Blend", explanation: "A classic herbal blend that may gently ease you toward sleep.", safetyNote: "Avoid if allergic to chamomile or ragweed." },
    ],
    foods: [
      { name: "Tart Cherries", explanation: "Naturally contain melatonin precursors.", safetyNote: "Best consumed 1–2 hours before bed." },
      { name: "Warm Milk with Honey", explanation: "A traditional remedy to ease into a relaxed pre-sleep state.", safetyNote: "Choose plant-based milk if lactose intolerant." },
    ],
    supplements: [
      { name: "Melatonin (low dose)", explanation: "Naturally produced by the body; may help signal sleep time.", safetyNote: "Consult a healthcare provider for appropriate use." },
    ],
    whyItHelps: "These natural supports may help the body and mind wind down. Pair with a consistent sleep schedule and limiting screens before bed.",
  },
  digestion: {
    query: "digestion",
    herbs: [
      { name: "Ginger Root", explanation: "Traditionally used to support digestive comfort and ease nausea.", safetyNote: "Large doses may interact with blood thinners." },
      { name: "Fennel Seeds", explanation: "Traditionally chewed after meals to support gas relief.", safetyNote: "Safe for most adults." },
    ],
    teas: [
      { name: "Peppermint Tea", explanation: "May help relax muscles of the digestive tract.", safetyNote: "Avoid if you have acid reflux." },
      { name: "Ginger Lemon Tea", explanation: "A warming blend traditionally used to support digestion.", safetyNote: "Generally safe." },
    ],
    foods: [
      { name: "Fermented Foods (yogurt, kimchi)", explanation: "Rich in beneficial bacteria that may support a healthy gut.", safetyNote: "Start slowly if new to fermented foods." },
      { name: "Papaya", explanation: "Contains papain, an enzyme associated with digestive support.", safetyNote: "Safe for most. Avoid large amounts during pregnancy." },
    ],
    supplements: [
      { name: "Digestive Enzymes", explanation: "May support the breakdown of proteins, fats, and carbohydrates.", safetyNote: "Consult a healthcare provider for recommendations." },
      { name: "Probiotics", explanation: "Beneficial bacteria that may help maintain a balanced gut.", safetyNote: "Consult a healthcare provider if immunocompromised." },
    ],
    whyItHelps: "These traditional supports may help ease discomfort and promote digestive balance. Hydration and fiber-rich foods are the foundation.",
  },
  energy: {
    query: "energy",
    herbs: [
      { name: "Maca Root", explanation: "Traditionally used to support energy, stamina, and vitality.", safetyNote: "Consult a healthcare provider if you have hormone-sensitive conditions." },
      { name: "Rhodiola Rosea", explanation: "Traditionally used to support mental and physical endurance.", safetyNote: "May interact with antidepressants." },
    ],
    teas: [
      { name: "Green Tea", explanation: "Contains gentle caffeine and L-theanine for sustained energy.", safetyNote: "Avoid late in the day if sensitive to caffeine." },
      { name: "Ginseng Tea", explanation: "Traditionally used to support energy and mental clarity.", safetyNote: "Avoid long-term continuous use." },
    ],
    foods: [
      { name: "Leafy Greens (spinach, kale)", explanation: "Rich in iron and B vitamins that support cellular energy.", safetyNote: "Pair with vitamin C for better iron absorption." },
      { name: "Nuts and Seeds", explanation: "Provide sustained energy through healthy fats and magnesium.", safetyNote: "Mindful of allergies." },
    ],
    supplements: [
      { name: "B-Complex Vitamins", explanation: "B vitamins play a key role in converting food into energy.", safetyNote: "Consult a healthcare provider for proper assessment." },
    ],
    whyItHelps: "Energy is influenced by nutrition, sleep, and stress. These natural supports may help the body produce and sustain energy more effectively.",
  },
  immunity: {
    query: "immunity",
    herbs: [
      { name: "Echinacea", explanation: "Traditionally used to support the immune system.", safetyNote: "Avoid long-term continuous use. Not for autoimmune conditions." },
      { name: "Elderberry", explanation: "Rich in antioxidants, traditionally used to support immune resilience.", safetyNote: "Always use properly prepared elderberry." },
    ],
    teas: [
      { name: "Elderberry & Rosehip Tea", explanation: "A vitamin C-rich blend traditionally used to support immune health.", safetyNote: "Generally safe." },
      { name: "Turmeric Golden Milk", explanation: "Curcumin has been associated with immune and anti-inflammatory support.", safetyNote: "Add black pepper to enhance absorption." },
    ],
    foods: [
      { name: "Citrus Fruits", explanation: "Rich in vitamin C, which supports immune cell function.", safetyNote: "Safe for daily use." },
      { name: "Garlic", explanation: "Contains allicin, associated with antimicrobial and immune support.", safetyNote: "May interact with blood thinners." },
    ],
    supplements: [
      { name: "Vitamin D3", explanation: "Plays a key role in regulating immune system responses.", safetyNote: "Have your levels tested and consult a healthcare provider." },
      { name: "Zinc", explanation: "A mineral essential for immune cell development.", safetyNote: "Excessive zinc can interfere with copper absorption." },
    ],
    whyItHelps: "Immune health depends on nutrient status, sleep, gut health, and stress management. Always focus on a varied, nutrient-dense diet as your primary immune foundation.",
  },
};

const DEFAULT: AIResponse = {
  query: "general wellness",
  herbs: [{ name: "Turmeric", explanation: "Traditionally used to support overall wellness and balance.", safetyNote: "Add black pepper to enhance absorption." }],
  teas: [{ name: "Green Tea", explanation: "Rich in antioxidants and gentle energy support.", safetyNote: "Contains caffeine. Best enjoyed before midday." }],
  foods: [{ name: "Berries", explanation: "Packed with antioxidants that support cellular health.", safetyNote: "Safe for daily use." }],
  supplements: [{ name: "Omega-3 Fatty Acids", explanation: "Essential fats that may support heart, brain, and joint health.", safetyNote: "Consult a healthcare provider for guidance." }],
  whyItHelps: "A holistic approach combines nutrition, movement, rest, and stress management.",
};

export function getAIResponse(query: string): AIResponse {
  const q = query.toLowerCase();
  if (q.includes("stress") || q.includes("anxiety") || q.includes("calm") || q.includes("relax")) return { ...DB.stress, query };
  if (q.includes("sleep") || q.includes("insomnia") || q.includes("rest") || q.includes("tired at night")) return { ...DB.sleep, query };
  if (q.includes("digest") || q.includes("bloat") || q.includes("gut") || q.includes("stomach") || q.includes("nausea")) return { ...DB.digestion, query };
  if (q.includes("energy") || q.includes("fatigue") || q.includes("tired") || q.includes("focus")) return { ...DB.energy, query };
  if (q.includes("immun") || q.includes("cold") || q.includes("flu") || q.includes("sick")) return { ...DB.immunity, query };
  return { ...DEFAULT, query };
}

export async function askAI(query: string): Promise<AIResponse> {
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
  return getAIResponse(query);
}
