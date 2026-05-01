export interface RemedyStep { stepNumber: number; instruction: string; duration?: string; }
export interface Remedy { id: string; title: string; description: string; category: string; prepTime: string; ingredients: string[]; steps: RemedyStep[]; benefits: string[]; safetyNote: string; image: string; }
export interface PlanActivity { id: string; time: string; title: string; description: string; category: "morning" | "afternoon" | "evening"; duration?: string; }
export interface WellnessPlan { id: string; title: string; subtitle: string; goal: string; duration: string; days: { day: number; label: string; activities: PlanActivity[]; foods: string[]; teas: string[]; supplements: string[]; }[]; groceryList: string[]; image: string; }
export interface Recipe { id: string; title: string; description: string; category: string; prepTime: string; goal: string; ingredients: string[]; steps: RemedyStep[]; variations: string[]; groceryList: string[]; image: string; }
export interface DailyTip { id: string; title: string; body: string; category: string; }
export interface RoutineTask { id: string; label: string; time?: string; category: "morning" | "afternoon" | "evening"; }

export const DAILY_TIPS: DailyTip[] = [
  { id: "tip-1", title: "Breathe with intention", body: "Try 4-7-8 breathing: inhale for 4 counts, hold for 7, exhale for 8.", category: "stress" },
  { id: "tip-2", title: "Start with warm lemon water", body: "Beginning your morning with warm lemon water may support digestion.", category: "digestion" },
  { id: "tip-3", title: "Move your body gently", body: "Even 10 minutes of gentle movement may support circulation and energy.", category: "energy" },
  { id: "tip-4", title: "Wind down with a ritual", body: "A consistent evening ritual signals to your body that rest is coming.", category: "sleep" },
  { id: "tip-5", title: "Eat the rainbow", body: "Each color of vegetable contains unique phytonutrients. Aim for 5–7 colors.", category: "immunity" },
  { id: "tip-6", title: "Hydrate mindfully", body: "Drinking water slowly throughout the day supports energy and digestion.", category: "general" },
  { id: "tip-7", title: "Spend time in nature", body: "Even brief time outdoors may help reduce cortisol and support calm.", category: "stress" },
];

export const ROUTINE_TASKS: RoutineTask[] = [
  { id: "rt-1", label: "Warm lemon water",      time: "7:00 AM",  category: "morning" },
  { id: "rt-2", label: "5-minute breathing",    time: "7:15 AM",  category: "morning" },
  { id: "rt-3", label: "Morning stretch",        time: "7:30 AM",  category: "morning" },
  { id: "rt-4", label: "Herbal tea break",       time: "3:00 PM",  category: "afternoon" },
  { id: "rt-5", label: "Mindful walk",           time: "4:00 PM",  category: "afternoon" },
  { id: "rt-6", label: "Digital sunset",         time: "9:00 PM",  category: "evening" },
  { id: "rt-7", label: "Evening wind-down tea",  time: "9:30 PM",  category: "evening" },
];

export function getTodayTip(): DailyTip {
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_TIPS[day % DAILY_TIPS.length];
}

export const REMEDIES: Remedy[] = [
  {
    id: "remedy-ginger-tea",
    title: "Soothing Ginger Digestive Tea",
    description: "A warming, traditional remedy used to ease bloating, nausea, and sluggish digestion.",
    category: "Digestion", prepTime: "10 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/ginger-digestive-tea.jpg",
    ingredients: ["1 inch fresh ginger root","1 cup filtered water","1 tsp raw honey","Squeeze of lemon","Pinch of black pepper"],
    steps: [
      { stepNumber: 1, instruction: "Slice fresh ginger into thin rounds." },
      { stepNumber: 2, instruction: "Bring water to a gentle boil." },
      { stepNumber: 3, instruction: "Add ginger and simmer.", duration: "10 minutes" },
      { stepNumber: 4, instruction: "Strain, cool slightly, then add honey and lemon." },
    ],
    benefits: ["Digestive comfort","Traditionally used for nausea","Warming"],
    safetyNote: "Safe in food amounts. Large doses may interact with blood thinners.",
  },
  {
    id: "remedy-lavender-calm",
    title: "Lavender Calming Evening Ritual",
    description: "A simple evening practice using lavender to signal rest and ease a busy mind.",
    category: "Stress & Sleep", prepTime: "15 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/lavender-calming-ritual.jpg",
    ingredients: ["Dried lavender buds","1 cup hot water","1 tsp honey"],
    steps: [
      { stepNumber: 1, instruction: "Steep lavender in hot water.", duration: "5 minutes" },
      { stepNumber: 2, instruction: "Strain, add honey. Take 5 slow breaths." },
      { stepNumber: 3, instruction: "Sip slowly and set an intention for rest." },
    ],
    benefits: ["Supports relaxation","Calming sleep ritual"],
    safetyNote: "Generally safe. Avoid medicinal doses during pregnancy.",
  },
  {
    id: "remedy-immunity-shot",
    title: "Immunity Wellness Shot",
    description: "A potent shot combining ginger, turmeric, and citrus to support immune resilience.",
    category: "Immunity", prepTime: "5 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/immunity-wellness-shot.jpg",
    ingredients: ["1 inch fresh ginger","1 tsp turmeric","Juice of 1 lemon","Pinch of black pepper","1 tsp honey"],
    steps: [
      { stepNumber: 1, instruction: "Juice ginger or grate and squeeze through cloth." },
      { stepNumber: 2, instruction: "Combine all ingredients in a small glass and stir." },
      { stepNumber: 3, instruction: "Drink as a shot on an empty stomach." },
    ],
    benefits: ["Vitamin C","Anti-inflammatory","Immune support"],
    safetyNote: "Dilute if too intense. Avoid high-dose turmeric during pregnancy.",
  },
  {
    id: "remedy-ashwagandha-milk",
    title: "Adaptogenic Moon Milk",
    description: "A nourishing bedtime milk with ashwagandha and warming spices to support deep rest.",
    category: "Sleep & Stress", prepTime: "8 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/adaptogenic-moon-milk.jpg",
    ingredients: ["1 cup oat milk","1 tsp ashwagandha powder","1/2 tsp cinnamon","1 tsp honey","Pinch of nutmeg"],
    steps: [
      { stepNumber: 1, instruction: "Heat oat milk gently. Do not boil." },
      { stepNumber: 2, instruction: "Whisk in ashwagandha and cinnamon.", duration: "3 minutes" },
      { stepNumber: 3, instruction: "Add honey and nutmeg. Pour and enjoy 30–60 min before bed." },
    ],
    benefits: ["Adaptogenic support","Promotes relaxation"],
    safetyNote: "Consult a healthcare provider if pregnant or on thyroid medication.",
  },
  {
    id: "remedy-energy-smoothie",
    title: "Green Energy Morning Smoothie",
    description: "A nutrient-dense smoothie to support sustained morning energy without the crash.",
    category: "Energy", prepTime: "5 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/green-energy-smoothie.jpg",
    ingredients: ["1 cup spinach or kale","1 banana (frozen)","1 tsp maca powder","1 tbsp almond butter","1 cup coconut water"],
    steps: [
      { stepNumber: 1, instruction: "Add coconut water to blender." },
      { stepNumber: 2, instruction: "Add greens, banana, maca, almond butter. Blend smooth.", duration: "30 seconds" },
    ],
    benefits: ["Sustained energy","B vitamins","Adaptogenic maca"],
    safetyNote: "Great for most people.",
  },
];

export const PLANS: WellnessPlan[] = [
  {
    id: "plan-stress-3day",
    title: "3-Day Stress Relief",
    subtitle: "Reset your nervous system with gentle, natural support.",
    goal: "stress", duration: "3 days",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/plans/stress-relief-plan.jpg",
    groceryList: ["Chamomile tea","Lavender tea","Ashwagandha powder","Dark chocolate (70%+)","Blueberries","Oat milk","Honey","Magnesium supplement"],
    days: [
      {
        day: 1, label: "Ground",
        activities: [
          { id: "s3-1-1", time: "7:00 AM", title: "Warm lemon water", description: "Start your day with warm water and lemon.", category: "morning", duration: "5 min" },
          { id: "s3-1-2", time: "7:30 AM", title: "5-minute breathing", description: "4-7-8 breathing: inhale 4, hold 7, exhale 8.", category: "morning", duration: "5 min" },
          { id: "s3-1-3", time: "2:00 PM", title: "Ashwagandha in warm milk", description: "Blend 1 tsp ashwagandha into warm oat milk.", category: "afternoon", duration: "10 min" },
          { id: "s3-1-4", time: "9:00 PM", title: "Lavender winding-down tea", description: "Brew lavender tea and sit without screens.", category: "evening", duration: "20 min" },
        ],
        foods: ["Leafy greens","Blueberries","Dark chocolate","Avocado"],
        teas: ["Chamomile","Lavender"],
        supplements: ["Magnesium glycinate (consult provider)"],
      },
      {
        day: 2, label: "Release",
        activities: [
          { id: "s3-2-1", time: "7:00 AM", title: "Gratitude journaling", description: "Write 3 things you are grateful for.", category: "morning", duration: "10 min" },
          { id: "s3-2-2", time: "7:30 AM", title: "Gentle stretching", description: "Follow a gentle 10-min morning stretch.", category: "morning", duration: "10 min" },
          { id: "s3-2-3", time: "12:00 PM", title: "Mindful lunch", description: "Eat away from screens. Chew slowly.", category: "afternoon" },
          { id: "s3-2-4", time: "9:00 PM", title: "Progressive muscle relaxation", description: "Tense and release each muscle group.", category: "evening", duration: "15 min" },
        ],
        foods: ["Salmon","Walnuts","Sweet potato","Berries"],
        teas: ["Holy basil (tulsi)","Chamomile"],
        supplements: ["Ashwagandha (consult provider)"],
      },
      {
        day: 3, label: "Restore",
        activities: [
          { id: "s3-3-1", time: "7:00 AM", title: "Morning walk in nature", description: "15-minute walk outside without headphones.", category: "morning", duration: "15 min" },
          { id: "s3-3-2", time: "3:00 PM", title: "Herbal tea break", description: "Step away from work for a calming herbal tea.", category: "afternoon", duration: "10 min" },
          { id: "s3-3-3", time: "8:30 PM", title: "Digital sunset", description: "Turn off all screens 1 hour before bed.", category: "evening" },
          { id: "s3-3-4", time: "9:30 PM", title: "Moon milk ritual", description: "Make ashwagandha moon milk and reflect.", category: "evening", duration: "15 min" },
        ],
        foods: ["Dark leafy greens","Fermented foods","Tart cherries"],
        teas: ["Lemon balm","Lavender"],
        supplements: ["L-Theanine (consult provider)"],
      },
    ],
  },
  {
    id: "plan-sleep-7day",
    title: "7-Day Sleep Reset",
    subtitle: "Rebuild healthy sleep habits with natural plant support.",
    goal: "sleep", duration: "7 days",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/plans/sleep-reset-plan.jpg",
    groceryList: ["Chamomile tea","Valerian root tea","Lemon balm tea","Tart cherry juice","Magnesium supplement","Oat milk","Honey","Lavender oil"],
    days: [
      {
        day: 1, label: "Awareness",
        activities: [
          { id: "sl7-1-1", time: "10:00 PM", title: "Track your sleep", description: "Note your bedtime and how rested you felt.", category: "evening" },
          { id: "sl7-1-2", time: "9:00 PM", title: "Chamomile tea", description: "Brew chamomile tea 1 hour before bed.", category: "evening", duration: "5 min" },
        ],
        foods: ["Tart cherries","Almonds","Warm oatmeal with honey"],
        teas: ["Chamomile"],
        supplements: ["Magnesium (consult provider)"],
      },
    ],
  },
  {
    id: "plan-energy-5day",
    title: "5-Day Energy Revival",
    subtitle: "Naturally boost vitality with adaptogens and nutrient-dense foods.",
    goal: "energy", duration: "5 days",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/plans/energy-revival-plan.jpg",
    groceryList: ["Maca powder","Green tea","Spinach","Kale","Frozen bananas","Almond butter","Coconut water","Walnuts"],
    days: [
      {
        day: 1, label: "Energize",
        activities: [
          { id: "en5-1-1", time: "7:00 AM", title: "Green energy smoothie", description: "Start your day with the green energy smoothie.", category: "morning", duration: "5 min" },
          { id: "en5-1-2", time: "10:00 AM", title: "Green tea break", description: "Swap coffee for green tea mid-morning.", category: "morning", duration: "10 min" },
          { id: "en5-1-3", time: "2:00 PM", title: "10-minute walk", description: "A brisk walk after lunch supports energy.", category: "afternoon", duration: "10 min" },
        ],
        foods: ["Green smoothie","Leafy salad","Nuts and seeds","Complex carbs"],
        teas: ["Green tea","Ginseng tea"],
        supplements: ["Maca powder in smoothie"],
      },
    ],
  },
];

export const RECIPES: Recipe[] = [
  {
    id: "recipe-golden-milk",
    title: "Golden Turmeric Latte",
    description: "A warming, anti-inflammatory beverage traditionally used to support immunity and overall wellbeing.",
    category: "Drinks", prepTime: "5 min", goal: "immunity",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/recipes/golden-turmeric-latte.jpg",
    ingredients: ["1 cup oat milk","1 tsp turmeric powder","1/2 tsp cinnamon","1/4 tsp ginger powder","Pinch of black pepper","1 tsp honey"],
    steps: [
      { stepNumber: 1, instruction: "Heat oat milk over medium heat. Do not boil." },
      { stepNumber: 2, instruction: "Whisk in turmeric, cinnamon, and ginger." },
      { stepNumber: 3, instruction: "Add black pepper and stir.", duration: "2 minutes" },
      { stepNumber: 4, instruction: "Sweeten with honey and pour into a mug." },
    ],
    variations: ["Add ashwagandha for extra support","Use coconut milk for richer texture"],
    groceryList: ["Oat milk","Turmeric powder","Cinnamon","Ginger powder","Honey"],
  },
  {
    id: "recipe-immunity-broth",
    title: "Herbal Immunity Broth",
    description: "A deeply nourishing broth with herbs and vegetables traditionally used to support the body.",
    category: "Soups", prepTime: "45 min", goal: "immunity",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/recipes/herbal-immunity-broth.jpg",
    ingredients: ["4 cups vegetable broth","3 garlic cloves","1 inch ginger","1 tsp turmeric","1 cup shiitake mushrooms","Lemon","Fresh thyme"],
    steps: [
      { stepNumber: 1, instruction: "Bring broth to a simmer." },
      { stepNumber: 2, instruction: "Add garlic, ginger, mushrooms, turmeric, herbs.", duration: "20 minutes" },
      { stepNumber: 3, instruction: "Simmer on low.", duration: "20 minutes" },
      { stepNumber: 4, instruction: "Add lemon juice and salt. Strain if desired." },
    ],
    variations: ["Add spinach in last 5 minutes","Include apple cider vinegar"],
    groceryList: ["Vegetable broth","Garlic","Fresh ginger","Turmeric","Shiitake mushrooms","Lemon","Fresh thyme"],
  },
  {
    id: "recipe-immunity-elderberry",
    title: "Elderberry Immune Syrup",
    description: "A rich, dark elderberry tonic traditionally used to bolster immune resilience.",
    category: "Drinks", prepTime: "30 min", goal: "immunity",
    image: "",
    ingredients: ["1/2 cup dried elderberries","2 cups filtered water","1 inch ginger","1 cinnamon stick","4 whole cloves","3 tbsp raw honey"],
    steps: [
      { stepNumber: 1, instruction: "Combine elderberries, water, ginger, cinnamon, cloves. Boil then simmer.", duration: "25 minutes" },
      { stepNumber: 2, instruction: "Mash elderberries and strain. Cool to room temperature." },
      { stepNumber: 3, instruction: "Stir in honey. Bottle and refrigerate. Take 1 tbsp daily." },
    ],
    variations: ["Add turmeric for anti-inflammatory support"],
    groceryList: ["Dried elderberries","Fresh ginger","Cinnamon stick","Whole cloves","Raw honey"],
  },
  {
    id: "recipe-immunity-citrus-shot",
    title: "Vitamin C Citrus Immunity Shot",
    description: "A bright, potent shot packed with vitamin C from citrus and cayenne.",
    category: "Drinks", prepTime: "5 min", goal: "immunity",
    image: "",
    ingredients: ["Juice of 2 oranges","Juice of 1 lemon","1/2 inch fresh ginger","Pinch of cayenne","1 tsp honey"],
    steps: [
      { stepNumber: 1, instruction: "Squeeze orange and lemon into a glass." },
      { stepNumber: 2, instruction: "Add ginger, cayenne, honey. Stir well." },
      { stepNumber: 3, instruction: "Drink as a shot on an empty stomach." },
    ],
    variations: ["Add turmeric for extra anti-inflammatory support"],
    groceryList: ["Oranges","Lemon","Fresh ginger","Honey","Cayenne pepper"],
  },
  {
    id: "recipe-energy-citrus",
    title: "Citrus Green Juice",
    description: "A bright, energizing green juice with spinach, apple, and citrus.",
    category: "Drinks", prepTime: "5 min", goal: "energy",
    image: "",
    ingredients: ["2 cups spinach","1 green apple","1 lemon","1 inch ginger","1/2 cup cucumber","1 cup water"],
    steps: [
      { stepNumber: 1, instruction: "Combine all ingredients in a blender or juicer." },
      { stepNumber: 2, instruction: "Blend until smooth. Strain if preferred." },
    ],
    variations: ["Add celery for extra minerals","Include mint for freshness"],
    groceryList: ["Spinach","Green apple","Lemon","Fresh ginger","Cucumber"],
  },
  {
    id: "recipe-energy-matcha",
    title: "Green Matcha Detox Smoothie",
    description: "A vibrant matcha smoothie packed with antioxidants and sustained energy.",
    category: "Drinks", prepTime: "5 min", goal: "energy",
    image: "",
    ingredients: ["1 tsp matcha powder","1 cup oat milk","1 banana","1 cup spinach","1 tsp honey"],
    steps: [
      { stepNumber: 1, instruction: "Whisk matcha with a small amount of warm water." },
      { stepNumber: 2, instruction: "Blend all ingredients until smooth." },
    ],
    variations: ["Add avocado for creaminess","Use coconut water instead of milk"],
    groceryList: ["Matcha powder","Oat milk","Banana","Spinach","Honey"],
  },
  {
    id: "recipe-stress-chamomile",
    title: "Chamomile Lemon Calm Tea",
    description: "A gentle, soothing tea to ease a restless mind and settle the nervous system.",
    category: "Drinks", prepTime: "5 min", goal: "stress",
    image: "",
    ingredients: ["2 tsp dried chamomile","1 cup hot water","Juice of half a lemon","1 tsp honey"],
    steps: [
      { stepNumber: 1, instruction: "Steep chamomile in hot water.", duration: "5 minutes" },
      { stepNumber: 2, instruction: "Strain, add lemon and honey. Sip slowly." },
    ],
    variations: ["Add lavender for extra calm","Include passionflower for deeper relaxation"],
    groceryList: ["Dried chamomile","Lemon","Honey"],
  },
  {
    id: "recipe-sleep-chamomile",
    title: "Chamomile Honey Night Tea",
    description: "A classic evening tea with chamomile and raw honey to ease you into restful sleep.",
    category: "Drinks", prepTime: "5 min", goal: "sleep",
    image: "",
    ingredients: ["2 tsp dried chamomile","1 cup hot water","1 tsp raw honey","Squeeze of lemon (optional)"],
    steps: [
      { stepNumber: 1, instruction: "Steep chamomile at 90°C for 5 minutes.", duration: "5 minutes" },
      { stepNumber: 2, instruction: "Add honey and lemon. Sip in a calm environment before bed." },
    ],
    variations: ["Add lavender for extra relaxation"],
    groceryList: ["Dried chamomile flowers","Raw honey","Lemon"],
  },
  {
    id: "recipe-sleep-banana",
    title: "Banana Magnesium Smoothie",
    description: "A tryptophan-packed smoothie with banana and almonds to naturally raise melatonin.",
    category: "Drinks", prepTime: "5 min", goal: "sleep",
    image: "",
    ingredients: ["1 frozen banana","1 cup almond milk","1 tbsp almond butter","1 tsp chia seeds","1/2 tsp cinnamon","1/4 cup blueberries"],
    steps: [
      { stepNumber: 1, instruction: "Blend all ingredients until smooth.", duration: "30 seconds" },
      { stepNumber: 2, instruction: "Enjoy 1 hour before bed." },
    ],
    variations: ["Add magnesium powder for extra mineral support"],
    groceryList: ["Banana","Almond milk","Almond butter","Chia seeds","Blueberries"],
  },
  {
    id: "recipe-digestion-ginger",
    title: "Soothing Ginger Digestive Tea",
    description: "A warming tea with fresh ginger and lemon to ease sluggish digestion.",
    category: "Drinks", prepTime: "10 min", goal: "digestion",
    image: "",
    ingredients: ["1 inch fresh ginger root","1 cup water","1 tsp honey","Squeeze of lemon"],
    steps: [
      { stepNumber: 1, instruction: "Simmer ginger in water.", duration: "10 minutes" },
      { stepNumber: 2, instruction: "Strain, add honey and lemon. Sip after meals." },
    ],
    variations: ["Add turmeric for anti-inflammatory support"],
    groceryList: ["Fresh ginger","Honey","Lemon"],
  },
  {
    id: "recipe-digestion-peppermint",
    title: "Peppermint Relief Tea",
    description: "Classic peppermint tea to soothe an upset stomach and reduce gas.",
    category: "Drinks", prepTime: "5 min", goal: "digestion",
    image: "",
    ingredients: ["2 tsp peppermint leaves","1 cup hot water","1 tsp raw honey"],
    steps: [
      { stepNumber: 1, instruction: "Steep peppermint for 5 minutes.", duration: "5 minutes" },
      { stepNumber: 2, instruction: "Add honey. Drink after meals." },
    ],
    variations: ["Combine with spearmint for milder flavour"],
    groceryList: ["Peppermint leaves","Raw honey"],
  },
];
