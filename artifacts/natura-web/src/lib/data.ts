export interface RemedyStep { stepNumber: number; instruction: string; duration?: string; }
export interface Remedy { id: string; title: string; description: string; category: string; prepTime: string; ingredients: string[]; steps: RemedyStep[]; benefits: string[]; safetyNote: string; image: string; }
export interface PlanActivity { id: string; time: string; title: string; description: string; category: "morning" | "afternoon" | "evening"; duration?: string; }
export interface WellnessPlan { id: string; title: string; subtitle: string; goal: string; duration: string; days: { day: number; label: string; activities: PlanActivity[]; foods: string[]; teas: string[]; supplements: string[]; }[]; groceryList: string[]; image: string; }
export interface Recipe { id: string; title: string; description: string; category: string; prepTime: string; goal: string; ingredients: string[]; steps: RemedyStep[]; variations: string[]; groceryList: string[]; image: string; }
export interface DailyTip { id: string; title: string; body: string; category: string; }
export interface RoutineTask { id: string; label: string; time?: string; category: "morning" | "afternoon" | "evening"; }

export const DAILY_TIPS: DailyTip[] = [
  { id: "tip-1", title: "Breathe with intention", body: "Try 4-7-8 breathing: inhale for 4 counts, hold for 7, exhale for 8. Traditionally used to calm the nervous system.", category: "stress" },
  { id: "tip-2", title: "Start with warm lemon water", body: "Beginning your morning with warm lemon water may support digestion and provide a gentle, hydrating wake-up call.", category: "digestion" },
  { id: "tip-3", title: "Move your body gently", body: "Even 10 minutes of gentle movement like walking or stretching may support circulation, mood, and energy levels.", category: "energy" },
  { id: "tip-4", title: "Wind down with a ritual", body: "Creating a consistent evening ritual — herbal tea, journaling, or stretching — signals to your body that rest is coming.", category: "sleep" },
  { id: "tip-5", title: "Eat the rainbow", body: "Each color of vegetable and fruit contains unique phytonutrients. Aim for 5-7 different colors throughout your day.", category: "immunity" },
  { id: "tip-6", title: "Hydrate mindfully", body: "Drinking water with intention — slowly, throughout the day — may support digestion, energy, and skin health better than gulping large amounts at once.", category: "general" },
  { id: "tip-7", title: "Spend time in nature", body: "Even brief time outdoors, often called 'forest bathing', may help reduce cortisol and support a grounded, calm feeling.", category: "stress" },
];

export const ROUTINE_TASKS: RoutineTask[] = [
  { id: "rt-1", label: "Warm lemon water", time: "7:00 AM", category: "morning" },
  { id: "rt-2", label: "5-minute breathing", time: "7:15 AM", category: "morning" },
  { id: "rt-3", label: "Morning stretch", time: "7:30 AM", category: "morning" },
  { id: "rt-4", label: "Herbal tea break", time: "3:00 PM", category: "afternoon" },
  { id: "rt-5", label: "Mindful walk", time: "4:00 PM", category: "afternoon" },
  { id: "rt-6", label: "Digital sunset", time: "9:00 PM", category: "evening" },
  { id: "rt-7", label: "Evening wind-down tea", time: "9:30 PM", category: "evening" },
];

export function getTodayTip(): DailyTip {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
}

export function getQuickWin(): string {
  const wins = [
    "Drink a glass of water right now",
    "Take 3 deep breaths",
    "Step outside for 5 minutes",
    "Eat a piece of fruit",
    "Stretch your neck and shoulders",
  ];
  return wins[new Date().getDay() % wins.length];
}

export const REMEDIES: Remedy[] = [
  {
    id: "remedy-ginger-tea",
    title: "Soothing Ginger Digestive Tea",
    description: "A warming, traditional remedy used to ease bloating, nausea, and sluggish digestion.",
    category: "Digestion",
    prepTime: "10 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/ginger-digestive-tea.jpg",
    ingredients: ["1 inch fresh ginger root", "1 cup filtered water", "1 tsp raw honey", "Squeeze of lemon juice", "Pinch of black pepper"],
    steps: [
      { stepNumber: 1, instruction: "Slice the fresh ginger into thin rounds. No need to peel." },
      { stepNumber: 2, instruction: "Bring one cup of filtered water to a gentle boil." },
      { stepNumber: 3, instruction: "Add the ginger slices to the boiling water.", duration: "10 minutes" },
      { stepNumber: 4, instruction: "Remove from heat and strain the ginger pieces out. Let cool slightly." },
      { stepNumber: 5, instruction: "Add honey, lemon juice, and a pinch of black pepper. Stir and enjoy warm." },
    ],
    benefits: ["May support digestive comfort", "Traditionally used for nausea relief", "Warming and grounding"],
    safetyNote: "Safe for most adults in food amounts. Large supplemental doses may interact with blood thinners.",
  },
  {
    id: "remedy-lavender-calm",
    title: "Lavender Calming Evening Ritual",
    description: "A simple evening practice using lavender to signal rest and ease a busy mind.",
    category: "Stress & Sleep",
    prepTime: "15 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/lavender-calming-ritual.jpg",
    ingredients: ["Dried lavender buds or lavender tea", "1 cup hot water", "1 tsp honey", "Optional: lavender essential oil for diffusing"],
    steps: [
      { stepNumber: 1, instruction: "Brew lavender tea or steep 1 tsp dried lavender buds in hot water.", duration: "5 minutes" },
      { stepNumber: 2, instruction: "While steeping, add a few drops of lavender oil to your diffuser (optional)." },
      { stepNumber: 3, instruction: "Strain, add honey, and hold the warm cup with both hands." },
      { stepNumber: 4, instruction: "Take 5 slow, deep breaths. Inhale through the nose, exhale through the mouth.", duration: "5 minutes" },
      { stepNumber: 5, instruction: "Sip slowly and mindfully. Set an intention for restful sleep." },
    ],
    benefits: ["May support relaxation", "Creates a calming sleep ritual", "Aromatherapy benefits"],
    safetyNote: "Lavender tea is generally safe. Avoid medicinal doses during pregnancy.",
  },
  {
    id: "remedy-immunity-shot",
    title: "Immunity Wellness Shot",
    description: "A potent wellness shot combining ginger, turmeric, and citrus to support immune resilience.",
    category: "Immunity",
    prepTime: "5 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/immunity-wellness-shot.jpg",
    ingredients: ["1 inch fresh ginger", "1 tsp turmeric powder", "Juice of 1 lemon", "Pinch of black pepper", "1 tsp raw honey", "2 tbsp water"],
    steps: [
      { stepNumber: 1, instruction: "Juice the fresh ginger (or grate and squeeze through a cloth)." },
      { stepNumber: 2, instruction: "Combine ginger juice, turmeric, lemon juice, and water in a small glass." },
      { stepNumber: 3, instruction: "Add a pinch of black pepper (activates turmeric's benefits) and honey." },
      { stepNumber: 4, instruction: "Stir well until combined." },
      { stepNumber: 5, instruction: "Drink in one shot on an empty stomach for best absorption." },
    ],
    benefits: ["Vitamin C from lemon", "Anti-inflammatory turmeric", "Traditional immune support"],
    safetyNote: "Strong and potent — dilute if too intense. Avoid daily high-dose turmeric during pregnancy.",
  },
  {
    id: "remedy-ashwagandha-milk",
    title: "Adaptogenic Moon Milk",
    description: "A nourishing bedtime milk with ashwagandha and warming spices to support deep rest.",
    category: "Sleep & Stress",
    prepTime: "8 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/adaptogenic-moon-milk.jpg",
    ingredients: ["1 cup oat or almond milk", "1 tsp ashwagandha powder", "1/2 tsp cinnamon", "1/4 tsp cardamom", "1 tsp honey", "Pinch of nutmeg"],
    steps: [
      { stepNumber: 1, instruction: "Heat oat milk in a small saucepan over medium-low heat. Do not boil." },
      { stepNumber: 2, instruction: "Whisk in ashwagandha powder, cinnamon, and cardamom." },
      { stepNumber: 3, instruction: "Continue stirring until fully blended and steaming.", duration: "3 minutes" },
      { stepNumber: 4, instruction: "Remove from heat. Add honey and a pinch of nutmeg." },
      { stepNumber: 5, instruction: "Pour into a mug and enjoy 30-60 minutes before bed as part of your evening ritual." },
    ],
    benefits: ["Adaptogenic stress support", "Promotes relaxation", "Warming and nourishing"],
    safetyNote: "Ashwagandha is generally well-tolerated. Consult a healthcare provider if pregnant or on thyroid medication.",
  },
  {
    id: "remedy-energy-smoothie",
    title: "Green Energy Morning Smoothie",
    description: "A nutrient-dense smoothie to support sustained morning energy without the crash.",
    category: "Energy",
    prepTime: "5 min",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/remedies/green-energy-smoothie.jpg",
    ingredients: ["1 cup spinach or kale", "1 banana (frozen)", "1 tsp maca powder", "1 tbsp almond butter", "1 cup coconut water", "1/2 tsp spirulina (optional)"],
    steps: [
      { stepNumber: 1, instruction: "Add coconut water to your blender first as the base." },
      { stepNumber: 2, instruction: "Add the leafy greens and blend until smooth.", duration: "30 seconds" },
      { stepNumber: 3, instruction: "Add frozen banana, maca powder, and almond butter." },
      { stepNumber: 4, instruction: "Blend until creamy. Add spirulina if using.", duration: "30 seconds" },
      { stepNumber: 5, instruction: "Pour into a glass and enjoy within 15 minutes for best nutritional value." },
    ],
    benefits: ["Sustained energy", "B vitamins from greens", "Adaptogenic maca support"],
    safetyNote: "Great for most people. If new to spirulina, start with a small amount.",
  },
];

export const PLANS: WellnessPlan[] = [
  {
    id: "plan-stress-3day",
    title: "3-Day Stress Relief",
    subtitle: "Reset your nervous system with gentle, natural support.",
    goal: "stress",
    duration: "3 days",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/plans/stress-relief-plan.jpg",
    groceryList: ["Chamomile tea", "Lavender tea", "Ashwagandha powder", "Dark chocolate (70%+)", "Blueberries", "Oat milk", "Honey", "Magnesium supplement"],
    days: [
      {
        day: 1, label: "Ground",
        activities: [
          { id: "s3-1-1", time: "7:00 AM", title: "Warm lemon water", description: "Start your day with a cup of warm water and lemon to gently awaken your system.", category: "morning", duration: "5 min" },
          { id: "s3-1-2", time: "7:30 AM", title: "5-minute breathing", description: "4-7-8 breathing: inhale 4, hold 7, exhale 8. Repeat 5 times.", category: "morning", duration: "5 min" },
          { id: "s3-1-3", time: "2:00 PM", title: "Ashwagandha in warm milk", description: "Blend 1 tsp ashwagandha into warm oat milk with honey.", category: "afternoon", duration: "10 min" },
          { id: "s3-1-4", time: "9:00 PM", title: "Lavender winding-down tea", description: "Brew lavender tea and sit without screens for 15 minutes.", category: "evening", duration: "20 min" },
        ],
        foods: ["Leafy greens", "Blueberries", "Dark chocolate (small square)", "Avocado"],
        teas: ["Chamomile", "Lavender"],
        supplements: ["Magnesium glycinate (consult provider)"],
      },
      {
        day: 2, label: "Release",
        activities: [
          { id: "s3-2-1", time: "7:00 AM", title: "Gratitude journaling", description: "Write 3 things you are grateful for. No editing, just flow.", category: "morning", duration: "10 min" },
          { id: "s3-2-2", time: "7:30 AM", title: "Gentle yoga or stretching", description: "Follow a gentle 10-min morning stretch or yoga video.", category: "morning", duration: "10 min" },
          { id: "s3-2-3", time: "12:00 PM", title: "Mindful lunch", description: "Eat lunch away from screens. Chew slowly and savor each bite.", category: "afternoon" },
          { id: "s3-2-4", time: "9:00 PM", title: "Progressive muscle relaxation", description: "Tense and release each muscle group from feet to forehead.", category: "evening", duration: "15 min" },
        ],
        foods: ["Salmon or omega-3 rich food", "Walnuts", "Sweet potato", "Berries"],
        teas: ["Holy basil (tulsi)", "Chamomile"],
        supplements: ["Ashwagandha (consult provider)"],
      },
      {
        day: 3, label: "Restore",
        activities: [
          { id: "s3-3-1", time: "7:00 AM", title: "Morning walk in nature", description: "Take a 15-minute walk outside without headphones. Notice your surroundings.", category: "morning", duration: "15 min" },
          { id: "s3-3-2", time: "3:00 PM", title: "Herbal tea break", description: "Step away from work and make yourself a calming herbal tea.", category: "afternoon", duration: "10 min" },
          { id: "s3-3-3", time: "8:30 PM", title: "Digital sunset", description: "Turn off all screens 1 hour before bed. Read, journal, or simply rest.", category: "evening" },
          { id: "s3-3-4", time: "9:30 PM", title: "Moon milk ritual", description: "Make ashwagandha moon milk and reflect on the past 3 days.", category: "evening", duration: "15 min" },
        ],
        foods: ["Dark leafy greens", "Fermented foods", "Tart cherries", "Chamomile-infused oatmeal"],
        teas: ["Lemon balm", "Lavender"],
        supplements: ["L-Theanine (consult provider)"],
      },
    ],
  },
  {
    id: "plan-sleep-7day",
    title: "7-Day Sleep Reset",
    subtitle: "Rebuild healthy sleep habits with natural plant support.",
    goal: "sleep",
    duration: "7 days",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/plans/sleep-reset-plan.jpg",
    groceryList: ["Chamomile tea", "Valerian root tea", "Lemon balm tea", "Tart cherry juice", "Passionflower", "Magnesium supplement", "Oat milk", "Honey", "Lavender oil"],
    days: [
      {
        day: 1, label: "Awareness",
        activities: [
          { id: "sl7-1-1", time: "10:00 PM", title: "Track your sleep", description: "Note your bedtime, wake time, and how rested you felt (1-5).", category: "evening" },
          { id: "sl7-1-2", time: "9:00 PM", title: "Chamomile tea", description: "Brew chamomile tea 1 hour before your intended sleep time.", category: "evening", duration: "5 min" },
        ],
        foods: ["Tart cherries", "Almonds", "Warm oatmeal with honey"],
        teas: ["Chamomile"],
        supplements: ["Magnesium (consult provider)"],
      },
    ],
  },
  {
    id: "plan-energy-5day",
    title: "5-Day Energy Revival",
    subtitle: "Naturally boost vitality with adaptogens and nutrient-dense foods.",
    goal: "energy",
    duration: "5 days",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/plans/energy-revival-plan.jpg",
    groceryList: ["Maca powder", "Green tea", "Spinach", "Kale", "Frozen bananas", "Almond butter", "Coconut water", "Walnuts", "Ginseng tea", "B-complex supplement"],
    days: [
      {
        day: 1, label: "Energize",
        activities: [
          { id: "en5-1-1", time: "7:00 AM", title: "Green energy smoothie", description: "Start your day with the green energy smoothie recipe.", category: "morning", duration: "5 min" },
          { id: "en5-1-2", time: "10:00 AM", title: "Green tea break", description: "Swap coffee for green tea mid-morning for sustained focus.", category: "morning", duration: "10 min" },
          { id: "en5-1-3", time: "2:00 PM", title: "10-minute walk", description: "A brisk walk after lunch supports blood sugar and afternoon energy.", category: "afternoon", duration: "10 min" },
        ],
        foods: ["Green smoothie", "Leafy green salad", "Nuts and seeds", "Complex carbs"],
        teas: ["Green tea", "Ginseng tea"],
        supplements: ["Maca powder in smoothie", "B-complex (consult provider)"],
      },
    ],
  },
];

export const RECIPES: Recipe[] = [
  {
    id: "recipe-golden-milk",
    title: "Golden Turmeric Latte",
    description: "A warming, anti-inflammatory beverage traditionally used to support immunity and overall wellbeing.",
    category: "Drinks",
    prepTime: "5 min",
    goal: "immunity",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/recipes/golden-turmeric-latte.jpg",
    ingredients: ["1 cup oat milk", "1 tsp turmeric powder", "1/2 tsp cinnamon", "1/4 tsp ginger powder", "Pinch of black pepper", "1 tsp honey or maple syrup"],
    steps: [
      { stepNumber: 1, instruction: "Heat oat milk in a saucepan over medium heat. Do not boil." },
      { stepNumber: 2, instruction: "Whisk in turmeric, cinnamon, and ginger." },
      { stepNumber: 3, instruction: "Add black pepper and stir until combined.", duration: "2 minutes" },
      { stepNumber: 4, instruction: "Remove from heat and sweeten with honey." },
      { stepNumber: 5, instruction: "Pour into your favorite mug and enjoy warm." },
    ],
    variations: ["Add 1/2 tsp ashwagandha for extra adaptogenic support", "Use coconut milk for a richer, creamier texture", "Serve iced with ice cubes for a summer version"],
    groceryList: ["Oat milk", "Turmeric powder", "Cinnamon", "Ginger powder", "Honey"],
  },
  {
    id: "recipe-immunity-broth",
    title: "Herbal Immunity Broth",
    description: "A deeply nourishing broth with herbs and vegetables traditionally used to support the body.",
    category: "Soups",
    prepTime: "45 min",
    goal: "immunity",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/recipes/herbal-immunity-broth.jpg",
    ingredients: ["4 cups vegetable broth", "3 garlic cloves, minced", "1 inch fresh ginger", "1 tsp turmeric", "1 cup shiitake mushrooms", "1 lemon (juice)", "Fresh thyme or rosemary", "Sea salt to taste"],
    steps: [
      { stepNumber: 1, instruction: "Bring vegetable broth to a simmer in a large pot." },
      { stepNumber: 2, instruction: "Add garlic, ginger, and mushrooms." },
      { stepNumber: 3, instruction: "Stir in turmeric and fresh herbs.", duration: "20 minutes" },
      { stepNumber: 4, instruction: "Reduce heat and let simmer on low.", duration: "20 minutes" },
      { stepNumber: 5, instruction: "Remove from heat, add lemon juice and salt. Strain if desired." },
    ],
    variations: ["Add a handful of spinach in the last 5 minutes", "Include 1 tbsp apple cider vinegar for extra gut support", "Make a big batch and freeze individual portions"],
    groceryList: ["Vegetable broth", "Garlic", "Fresh ginger", "Turmeric", "Shiitake mushrooms", "Lemon", "Fresh thyme"],
  },
  {
    id: "recipe-overnight-oats",
    title: "Adaptogenic Overnight Oats",
    description: "A prep-ahead breakfast rich in fiber, adaptogens, and sustained energy.",
    category: "Breakfast",
    prepTime: "5 min (+ overnight)",
    goal: "energy",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/recipes/adaptogenic-overnight-oats.jpg",
    ingredients: ["1/2 cup rolled oats", "1 cup oat milk", "1 tsp maca powder", "1 tbsp chia seeds", "1 tbsp almond butter", "1 tsp honey", "Toppings: berries, nuts, granola"],
    steps: [
      { stepNumber: 1, instruction: "Combine oats, oat milk, maca, and chia seeds in a jar." },
      { stepNumber: 2, instruction: "Stir well to combine. Add honey." },
      { stepNumber: 3, instruction: "Cover and refrigerate overnight.", duration: "8 hours" },
      { stepNumber: 4, instruction: "In the morning, add almond butter and stir." },
      { stepNumber: 5, instruction: "Top with berries, nuts, or your favorite toppings and enjoy." },
    ],
    variations: ["Add 1 tsp ashwagandha for stress-support", "Use coconut milk for a tropical flavor", "Add cacao powder for an antioxidant boost"],
    groceryList: ["Rolled oats", "Oat milk", "Maca powder", "Chia seeds", "Almond butter", "Mixed berries", "Honey"],
  },
  {
    id: "recipe-antistress-salad",
    title: "Stress-Less Green Salad",
    description: "A nutrient-dense salad with magnesium-rich ingredients to support a calm nervous system.",
    category: "Meals",
    prepTime: "10 min",
    goal: "stress",
    image: "https://apexdigital.design/wp-content/uploads/natura-ai/recipes/stress-less-salad.jpg",
    ingredients: ["2 cups baby spinach", "1/2 avocado", "1/4 cup walnuts", "1/4 cup blueberries", "2 tbsp pumpkin seeds", "Dressing: olive oil, lemon, salt, pepper"],
    steps: [
      { stepNumber: 1, instruction: "Wash and dry the spinach. Place in a large bowl." },
      { stepNumber: 2, instruction: "Slice the avocado and add to the bowl." },
      { stepNumber: 3, instruction: "Add walnuts, blueberries, and pumpkin seeds." },
      { stepNumber: 4, instruction: "Whisk together olive oil, fresh lemon juice, salt, and pepper." },
      { stepNumber: 5, instruction: "Drizzle dressing over the salad and toss gently. Enjoy immediately." },
    ],
    variations: ["Add grilled salmon or chickpeas for protein", "Include sliced cucumber for extra hydration", "Swap blueberries for pomegranate seeds"],
    groceryList: ["Baby spinach", "Avocado", "Walnuts", "Blueberries", "Pumpkin seeds", "Olive oil", "Lemon"],
  },
];
