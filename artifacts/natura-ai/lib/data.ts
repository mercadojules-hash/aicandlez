import remediesData from "../data/remedies.json";
import plansData from "../data/plans.json";
import recipesData from "../data/recipes.json";

export interface RemedyStep {
  stepNumber: number;
  instruction: string;
  duration?: string;
}

export interface Remedy {
  id: string;
  title: string;
  description: string;
  category: string;
  prepTime: string;
  ingredients: string[];
  steps: RemedyStep[];
  benefits: string[];
  safetyNote: string;
  image: string;
  whyItHelps?: string;
  bestTime?: string;
  whenToUse?: string;
  whoFor?: string;
  avoidIf?: string;
  tags?: string[];
}

export interface PlanActivity {
  id: string;
  time: string;
  title: string;
  description: string;
  category: "morning" | "afternoon" | "evening";
  duration?: string;
}

export interface WellnessPlan {
  id: string;
  title: string;
  subtitle: string;
  goal: string;
  duration: string;
  days: {
    day: number;
    label: string;
    activities: PlanActivity[];
    foods: string[];
    teas: string[];
    supplements: string[];
  }[];
  groceryList: string[];
  image: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  category: string;
  prepTime: string;
  goal: string;
  ingredients: string[];
  steps: RemedyStep[];
  variations: string[];
  groceryList: string[];
  image: string;
  whyItHelps?: string;
  bestTime?: string;
  tags?: string[];
}

export interface DailyTip {
  id: string;
  title: string;
  body: string;
  category: string;
}

function normalizeImage(raw: any): string {
  return (raw.image || raw.imageUrl || "") as string;
}

export const REMEDIES: Remedy[] = (remediesData as any[]).map((r) => ({
  ...r,
  image: normalizeImage(r),
}));

export const PLANS: WellnessPlan[] = (plansData as any[]).map((p) => ({
  ...p,
  image: normalizeImage(p),
}));

export const RECIPES: Recipe[] = (recipesData as any[]).map((r) => ({
  ...r,
  image: normalizeImage(r),
}));

export const DAILY_TIPS: DailyTip[] = [
  {
    id: "tip-1",
    title: "Breathe with intention",
    body: "Try 4-7-8 breathing: inhale for 4 counts, hold for 7, exhale for 8. Traditionally used to calm the nervous system.",
    category: "stress",
  },
  {
    id: "tip-2",
    title: "Start with warm lemon water",
    body: "Beginning your morning with warm lemon water may support digestion and provide a gentle, hydrating wake-up call.",
    category: "digestion",
  },
  {
    id: "tip-3",
    title: "Move your body gently",
    body: "Even 10 minutes of gentle movement like walking or stretching may support circulation, mood, and energy levels.",
    category: "energy",
  },
  {
    id: "tip-4",
    title: "Wind down with a ritual",
    body: "Creating a consistent evening ritual — herbal tea, journaling, or stretching — signals to your body that rest is coming.",
    category: "sleep",
  },
  {
    id: "tip-5",
    title: "Eat the rainbow",
    body: "Each color of vegetable and fruit contains unique phytonutrients. Aim for 5-7 different colors throughout your day.",
    category: "immunity",
  },
  {
    id: "tip-6",
    title: "Hydrate mindfully",
    body: "Drinking water with intention — slowly, throughout the day — may support digestion, energy, and skin health better than gulping large amounts at once.",
    category: "general",
  },
  {
    id: "tip-7",
    title: "Spend time in nature",
    body: "Even brief time outdoors, often called 'forest bathing', may help reduce cortisol and support a grounded, calm feeling.",
    category: "stress",
  },
];

export const ROUTINE_TASKS = [
  { id: "rt-1", label: "Drink warm water on rising", time: "7:00 AM", category: "morning" as const },
  { id: "rt-2", label: "5 minutes of breathing or meditation", time: "7:15 AM", category: "morning" as const },
  { id: "rt-3", label: "Take morning supplements", time: "8:00 AM", category: "morning" as const },
  { id: "rt-4", label: "Move your body (walk/stretch)", time: "8:30 AM", category: "morning" as const },
  { id: "rt-5", label: "Drink herbal tea mid-morning", time: "10:30 AM", category: "morning" as const },
  { id: "rt-6", label: "Mindful lunch (no screens)", time: "12:30 PM", category: "afternoon" as const },
  { id: "rt-7", label: "Short walk after lunch", time: "1:00 PM", category: "afternoon" as const },
  { id: "rt-8", label: "Afternoon herbal tea", time: "3:30 PM", category: "afternoon" as const },
  { id: "rt-9", label: "Digital sunset (limit screens)", time: "8:30 PM", category: "evening" as const },
  { id: "rt-10", label: "Evening herbal tea ritual", time: "9:00 PM", category: "evening" as const },
  { id: "rt-11", label: "Gratitude journaling", time: "9:15 PM", category: "evening" as const },
  { id: "rt-12", label: "Lights out by 10:30 PM", time: "10:30 PM", category: "evening" as const },
];

export function getTodayTip(): DailyTip {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
}

export function getQuickWin(): string {
  const wins = [
    "Drink one extra glass of water today.",
    "Take 5 deep breaths before your next meal.",
    "Go outside for at least 10 minutes.",
    "Replace one coffee with herbal tea.",
    "Eat a handful of mixed berries or nuts.",
    "Do 5 minutes of gentle stretching.",
    "Turn off screens 30 minutes earlier tonight.",
  ];
  const day = new Date().getDay();
  return wins[day % wins.length];
}
