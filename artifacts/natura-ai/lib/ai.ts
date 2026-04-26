import { REMEDIES, RECIPES } from "./data";
import { BLOG_POSTS } from "./blogData";

export interface AIIngredient {
  name: string;
  explanation: string;
  safetyNote: string;
}

export interface AIResponse {
  herbs: AIIngredient[];
  teas: AIIngredient[];
  foods: AIIngredient[];
  supplements: AIIngredient[];
  whyItHelps: string;
  query: string;
  isEmergency?: boolean;
  emergencyMessage?: string;
}

const EMERGENCY_KEYWORDS = [
  "chest pain",
  "chest pressure",
  "can't breathe",
  "cannot breathe",
  "difficulty breathing",
  "heart attack",
  "stroke",
  "suicidal",
  "want to die",
  "kill myself",
  "end my life",
  "severe pain",
  "unconscious",
  "overdose",
  "fainted",
  "fainting",
  "collapsed",
  "seizure",
  "can't stop bleeding",
  "allergic reaction",
  "anaphylaxis",
];

function checkEmergency(query: string): boolean {
  const lower = query.toLowerCase();
  return EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw));
}

const WELLNESS_DB: Record<string, AIResponse> = {
  stress: {
    query: "stress",
    herbs: [
      {
        name: "Ashwagandha",
        explanation: "Traditionally used as an adaptogen that may help the body adapt to stress and support balanced cortisol levels.",
        safetyNote: "Generally well-tolerated. Consult a healthcare provider if pregnant or taking thyroid medication.",
      },
      {
        name: "Holy Basil (Tulsi)",
        explanation: "Traditionally used to support a calm, focused state and may help ease tension.",
        safetyNote: "May interact with blood-thinning medications. Consult your healthcare provider.",
      },
    ],
    teas: [
      {
        name: "Chamomile Tea",
        explanation: "Chamomile contains apigenin, a compound that may support relaxation and ease a restless mind.",
        safetyNote: "Avoid if you have ragweed allergies. Safe for most adults in moderate amounts.",
      },
      {
        name: "Lavender Tea",
        explanation: "Lavender's aroma and taste may support a calm, settled feeling.",
        safetyNote: "Avoid in large amounts during pregnancy.",
      },
    ],
    foods: [
      {
        name: "Dark Chocolate (70%+)",
        explanation: "Rich in magnesium and flavonoids that may help support a calmer mood.",
        safetyNote: "Enjoy in moderation. Contains caffeine.",
      },
      {
        name: "Blueberries",
        explanation: "Antioxidant-rich berries that may help protect against oxidative stress.",
        safetyNote: "No significant concerns. Great for daily use.",
      },
    ],
    supplements: [
      {
        name: "Magnesium Glycinate",
        explanation: "Magnesium may support muscle relaxation and a calm nervous system.",
        safetyNote: "This is for educational purposes only. Consult a healthcare provider for proper dosage.",
      },
      {
        name: "L-Theanine",
        explanation: "An amino acid found in green tea that may support relaxed alertness without drowsiness.",
        safetyNote: "Generally well-tolerated. Consult a healthcare provider if combining with medications.",
      },
    ],
    whyItHelps:
      "These suggestions may support the body's natural stress-response system. Adaptogenic herbs, relaxing teas, and magnesium-rich foods have been traditionally used to promote balance. Always combine with good sleep, movement, and breathing practices.",
  },

  sleep: {
    query: "sleep",
    herbs: [
      {
        name: "Valerian Root",
        explanation: "Traditionally used to support a more restful and settled sleep experience.",
        safetyNote: "Avoid combining with alcohol or sleep medications. Not for long-term use without guidance.",
      },
      {
        name: "Passionflower",
        explanation: "Traditionally used to ease an overactive mind before sleep.",
        safetyNote: "Avoid during pregnancy. May enhance sedative effects of medications.",
      },
    ],
    teas: [
      {
        name: "Lemon Balm Tea",
        explanation: "A calming herb that may support a quieter mind and more restful sleep.",
        safetyNote: "Generally safe. May interact with thyroid medications.",
      },
      {
        name: "Sleepytime Chamomile Blend",
        explanation: "A classic herbal blend that may gently ease you toward sleep.",
        safetyNote: "Avoid if allergic to chamomile or ragweed.",
      },
    ],
    foods: [
      {
        name: "Tart Cherries",
        explanation: "Naturally contain melatonin precursors that may support your body's sleep cycle.",
        safetyNote: "Safe for most adults. Best consumed 1-2 hours before bed.",
      },
      {
        name: "Warm Milk with Honey",
        explanation: "A traditional remedy believed to ease the body into a relaxed pre-sleep state.",
        safetyNote: "Choose plant-based milk if lactose intolerant.",
      },
    ],
    supplements: [
      {
        name: "Melatonin (low dose)",
        explanation: "Melatonin is naturally produced by the body and may help signal sleep time.",
        safetyNote: "Educational only. Consult a healthcare provider for appropriate use and timing.",
      },
    ],
    whyItHelps:
      "Sleep is regulated by circadian rhythms and neurotransmitters. These natural supports may help the body and mind wind down. Pair with a consistent sleep schedule, dark room, and limiting screens before bed.",
  },

  digestion: {
    query: "digestion",
    herbs: [
      {
        name: "Ginger Root",
        explanation: "Traditionally used to support digestive comfort and ease nausea or bloating.",
        safetyNote: "Safe in food amounts. Large doses may interact with blood thinners.",
      },
      {
        name: "Fennel Seeds",
        explanation: "Traditionally chewed after meals to support gas relief and digestive ease.",
        safetyNote: "Safe for most adults. Avoid medicinal amounts during pregnancy.",
      },
    ],
    teas: [
      {
        name: "Peppermint Tea",
        explanation: "May help relax the muscles of the digestive tract, supporting comfort after meals.",
        safetyNote: "Avoid if you have acid reflux, as it may relax the lower esophageal sphincter.",
      },
      {
        name: "Ginger Lemon Tea",
        explanation: "A warming, stimulating blend traditionally used to support digestion.",
        safetyNote: "Generally safe. May help with nausea.",
      },
    ],
    foods: [
      {
        name: "Fermented Foods (yogurt, kimchi)",
        explanation: "Rich in beneficial bacteria that may support a healthy gut microbiome.",
        safetyNote: "Start slowly if not used to fermented foods.",
      },
      {
        name: "Papaya",
        explanation: "Contains papain, an enzyme traditionally associated with digestive support.",
        safetyNote: "Safe for most. Avoid large amounts of unripe papaya during pregnancy.",
      },
    ],
    supplements: [
      {
        name: "Digestive Enzymes",
        explanation: "May support the breakdown of proteins, fats, and carbohydrates.",
        safetyNote: "Educational only. Consult a healthcare provider for personal recommendations.",
      },
      {
        name: "Probiotics",
        explanation: "Beneficial bacteria that may help maintain a balanced gut environment.",
        safetyNote: "Generally safe. Consult a healthcare provider if immunocompromised.",
      },
    ],
    whyItHelps:
      "Digestion is influenced by gut bacteria, enzyme production, and stress levels. These traditional supports may help ease discomfort and promote balance. Regular meals, adequate hydration, and fiber-rich foods are the foundation.",
  },

  energy: {
    query: "energy",
    herbs: [
      {
        name: "Maca Root",
        explanation: "A Peruvian root traditionally used to support energy, stamina, and vitality.",
        safetyNote: "Generally well-tolerated. Consult a healthcare provider if you have hormone-sensitive conditions.",
      },
      {
        name: "Rhodiola Rosea",
        explanation: "Traditionally used as an adaptogen to support mental and physical endurance.",
        safetyNote: "May interact with antidepressants. Start with a low dose.",
      },
    ],
    teas: [
      {
        name: "Green Tea",
        explanation: "Contains gentle caffeine and L-theanine for sustained, focused energy without jitteriness.",
        safetyNote: "Contains caffeine. Avoid late in the day if sensitive to caffeine.",
      },
      {
        name: "Ginseng Tea",
        explanation: "Traditionally used to support energy and mental clarity.",
        safetyNote: "Avoid long-term continuous use. May interact with blood thinners.",
      },
    ],
    foods: [
      {
        name: "Leafy Greens (spinach, kale)",
        explanation: "Rich in iron and B vitamins that support cellular energy production.",
        safetyNote: "Excellent for daily use. Pair with vitamin C for better iron absorption.",
      },
      {
        name: "Nuts and Seeds",
        explanation: "Provide sustained energy through healthy fats, protein, and magnesium.",
        safetyNote: "Mindful of allergies. Great for snacking.",
      },
    ],
    supplements: [
      {
        name: "B-Complex Vitamins",
        explanation: "B vitamins play a key role in converting food into cellular energy.",
        safetyNote: "Educational only. Consult a healthcare provider for proper assessment.",
      },
      {
        name: "CoQ10",
        explanation: "A compound found in every cell that may support mitochondrial energy production.",
        safetyNote: "Generally well-tolerated. Consult a healthcare provider if on statin medications.",
      },
    ],
    whyItHelps:
      "Energy is influenced by nutrition, sleep quality, stress, and mitochondrial health. These natural supports may help the body produce and sustain energy more effectively. Prioritize quality sleep, regular movement, and a balanced diet as your foundation.",
  },

  immunity: {
    query: "immunity",
    herbs: [
      {
        name: "Echinacea",
        explanation: "Traditionally used to support the immune system, particularly at the first sign of seasonal illness.",
        safetyNote: "Avoid long-term continuous use. Not recommended if you have autoimmune conditions.",
      },
      {
        name: "Elderberry",
        explanation: "Rich in antioxidants and traditionally used to support immune resilience.",
        safetyNote: "Always use properly prepared elderberry (raw elderberries can be toxic).",
      },
    ],
    teas: [
      {
        name: "Elderberry & Rosehip Tea",
        explanation: "A vitamin C-rich blend traditionally used to support immune health.",
        safetyNote: "Generally safe. Enjoy regularly during seasonal changes.",
      },
      {
        name: "Turmeric Golden Milk",
        explanation: "Turmeric's curcumin has been traditionally associated with immune and anti-inflammatory support.",
        safetyNote: "Add black pepper to enhance absorption. Avoid high doses during pregnancy.",
      },
    ],
    foods: [
      {
        name: "Citrus Fruits",
        explanation: "Rich in vitamin C, which supports the production and function of immune cells.",
        safetyNote: "Safe for daily use. Great addition to any meal.",
      },
      {
        name: "Garlic",
        explanation: "Contains allicin, a compound traditionally associated with antimicrobial and immune support.",
        safetyNote: "May interact with blood thinners. Best consumed cooked or crushed.",
      },
    ],
    supplements: [
      {
        name: "Vitamin D3",
        explanation: "Vitamin D plays a key role in regulating immune system responses.",
        safetyNote: "Educational only. Have your levels tested and consult a healthcare provider.",
      },
      {
        name: "Zinc",
        explanation: "A mineral essential for immune cell development and function.",
        safetyNote: "Educational only. Excessive zinc can interfere with copper absorption.",
      },
    ],
    whyItHelps:
      "Immune health depends on nutrient status, sleep, gut health, and stress management. These traditional supports may complement a healthy lifestyle. Always focus on a varied, nutrient-dense diet as your primary immune foundation.",
  },
};

const DEFAULT_RESPONSE: AIResponse = {
  query: "general wellness",
  herbs: [
    { name: "Turmeric", explanation: "A golden spice traditionally used across many cultures to support overall wellness and balance.", safetyNote: "Add black pepper to enhance absorption." },
  ],
  teas: [
    { name: "Green Tea", explanation: "Rich in antioxidants and gentle energy support.", safetyNote: "Contains caffeine. Best enjoyed before midday." },
  ],
  foods: [
    { name: "Berries", explanation: "Packed with antioxidants that support overall cellular health.", safetyNote: "Safe for daily use. Great in smoothies or on their own." },
  ],
  supplements: [
    { name: "Omega-3 Fatty Acids", explanation: "Essential fats that may support heart, brain, and joint health.", safetyNote: "Educational only. Consult a healthcare provider for guidance." },
  ],
  whyItHelps: "A holistic wellness approach combines nutrition, movement, rest, and stress management. These suggestions are general supports for everyday wellbeing.",
};

interface AppContextHint {
  remedyTitle?: string;
  remedyId?: string;
  recipeTitle?: string;
  recipeId?: string;
  blogTitle?: string;
  blogId?: string;
}

function getAppContext(topic: string): AppContextHint {
  const lower = topic.toLowerCase();
  const hint: AppContextHint = {};

  const remedy = REMEDIES.find(
    (r) =>
      r.tags?.some((t: string) => lower.includes(t)) ||
      r.title.toLowerCase().split(" ").some((w) => lower.includes(w)) ||
      (r as any).whoFor?.toLowerCase().includes(lower.split(" ")[0])
  );
  if (remedy) {
    hint.remedyTitle = remedy.title;
    hint.remedyId = remedy.id;
  }

  const recipe = RECIPES.find(
    (r) =>
      r.tags?.some((t: string) => lower.includes(t)) ||
      r.title.toLowerCase().split(" ").some((w) => lower.includes(w))
  );
  if (recipe) {
    hint.recipeTitle = recipe.title;
    hint.recipeId = recipe.id;
  }

  const post = BLOG_POSTS.find(
    (p) =>
      p.title.toLowerCase().split(" ").some((w) => w.length > 4 && lower.includes(w)) ||
      p.category.toLowerCase() === lower.split(" ")[0]
  );
  if (post) {
    hint.blogTitle = post.title;
    hint.blogId = post.id;
  }

  return hint;
}

function enrichWhyItHelps(base: string, ctx: AppContextHint): string {
  const parts: string[] = [base];
  if (ctx.remedyTitle) {
    parts.push(`In the Natura library, try the "${ctx.remedyTitle}" remedy for a hands-on starting point.`);
  }
  if (ctx.recipeTitle) {
    parts.push(`The "${ctx.recipeTitle}" recipe is a great complementary addition to your routine.`);
  }
  if (ctx.blogTitle) {
    parts.push(`Read "${ctx.blogTitle}" in the Blog tab for deeper guidance.`);
  }
  return parts.join(" ");
}

export function getAIResponse(query: string): AIResponse {
  const lower = query.toLowerCase();

  if (checkEmergency(query)) {
    return {
      query,
      herbs: [],
      teas: [],
      foods: [],
      supplements: [],
      whyItHelps: "",
      isEmergency: true,
      emergencyMessage:
        "⚠️ This may require immediate medical attention. Please call 911 or your local emergency number right away, or go to your nearest emergency room. Do not delay seeking professional care.",
    };
  }

  let base: AIResponse;
  let topicKey: string;

  if (lower.includes("stress") || lower.includes("anxiety") || lower.includes("nervous") || lower.includes("calm") || lower.includes("relax")) {
    base = WELLNESS_DB.stress; topicKey = "stress";
  } else if (lower.includes("sleep") || lower.includes("insomnia") || lower.includes("rest") || lower.includes("tired at night") || lower.includes("bedtime")) {
    base = WELLNESS_DB.sleep; topicKey = "sleep";
  } else if (lower.includes("digest") || lower.includes("bloat") || lower.includes("gut") || lower.includes("stomach") || lower.includes("nausea") || lower.includes("constipat")) {
    base = WELLNESS_DB.digestion; topicKey = "digestion";
  } else if (lower.includes("energy") || lower.includes("fatigue") || lower.includes("tired") || lower.includes("exhausted") || lower.includes("focus")) {
    base = WELLNESS_DB.energy; topicKey = "energy";
  } else if (lower.includes("immun") || lower.includes("cold") || lower.includes("flu") || lower.includes("sick") || lower.includes("infection")) {
    base = WELLNESS_DB.immunity; topicKey = "immunity";
  } else {
    base = DEFAULT_RESPONSE; topicKey = query;
  }

  const ctx = getAppContext(topicKey);
  return {
    ...base,
    query,
    whyItHelps: enrichWhyItHelps(base.whyItHelps, ctx),
  };
}

export async function askAI(query: string): Promise<AIResponse> {
  if (checkEmergency(query)) {
    return getAIResponse(query);
  }
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
  return getAIResponse(query);
}
