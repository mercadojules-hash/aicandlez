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
  imageUrl: string;
  whyItHelps?: string;
  bestTime?: string;
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
  imageUrl: string;
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
  imageUrl: string;
  whyItHelps?: string;
  bestTime?: string;
}

export interface DailyTip {
  id: string;
  title: string;
  body: string;
  category: string;
}

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

export const REMEDIES: Remedy[] = [
  {
    id: "remedy-ginger-tea",
    title: "Soothing Ginger Digestive Tea",
    description:
      "A warming, traditional remedy used to ease bloating, nausea, and sluggish digestion.",
    category: "Digestion",
    prepTime: "10 min",
    ingredients: [
      "1 inch fresh ginger root",
      "1 cup filtered water",
      "1 tsp raw honey",
      "Squeeze of lemon juice",
      "Pinch of black pepper",
    ],
    steps: [
      { stepNumber: 1, instruction: "Slice the fresh ginger into thin rounds. No need to peel." },
      { stepNumber: 2, instruction: "Bring one cup of filtered water to a gentle boil." },
      { stepNumber: 3, instruction: "Add the ginger slices to the boiling water.", duration: "10 minutes" },
      { stepNumber: 4, instruction: "Remove from heat and strain the ginger pieces out. Let cool slightly." },
      { stepNumber: 5, instruction: "Add honey, lemon juice, and a pinch of black pepper. Stir and enjoy warm." },
    ],
    benefits: [
      "May support digestive comfort",
      "Traditionally used for nausea relief",
      "Warming and grounding",
    ],
    safetyNote: "Safe for most adults in food amounts. Large doses may interact with blood thinners.",
    whyItHelps: "Ginger contains gingerols and shogaols — compounds traditionally associated with supporting gastric motility and easing digestive discomfort. Black pepper may enhance absorption.",
    bestTime: "Morning on an empty stomach, or after meals for digestive comfort.",
    imageUrl: "https://source.unsplash.com/600x400/?ginger,tea,digestion,spice",
  },
  {
    id: "remedy-lavender-calm",
    title: "Lavender Calming Evening Ritual",
    description:
      "A simple evening practice using lavender to signal rest and ease a busy mind.",
    category: "Stress & Sleep",
    prepTime: "15 min",
    ingredients: [
      "Dried lavender buds or lavender tea",
      "1 cup hot water",
      "1 tsp honey",
      "Optional: lavender essential oil for diffusing",
    ],
    steps: [
      { stepNumber: 1, instruction: "Brew lavender tea or steep 1 tsp dried lavender buds in hot water.", duration: "5 minutes" },
      { stepNumber: 2, instruction: "While steeping, add a few drops of lavender oil to your diffuser (optional)." },
      { stepNumber: 3, instruction: "Strain, add honey, and hold the warm cup with both hands." },
      { stepNumber: 4, instruction: "Take 5 slow, deep breaths. Inhale through the nose, exhale through the mouth.", duration: "5 minutes" },
      { stepNumber: 5, instruction: "Sip slowly and mindfully. Set an intention for restful sleep." },
    ],
    benefits: [
      "May support relaxation",
      "Creates a calming sleep ritual",
      "Aromatherapy benefits",
    ],
    safetyNote: "Lavender tea is generally safe. Avoid medicinal doses during pregnancy.",
    whyItHelps: "Lavender contains linalool and linalyl acetate, compounds traditionally used to support a calm nervous system. Ritual and routine cue the brain toward rest.",
    bestTime: "30–60 minutes before bed as part of your wind-down routine.",
    imageUrl: "https://source.unsplash.com/600x400/?lavender,aromatherapy,calm,purple",
  },
  {
    id: "remedy-immunity-shot",
    title: "Immunity Wellness Shot",
    description:
      "A potent, traditional wellness shot combining ginger, turmeric, and citrus to support immune resilience.",
    category: "Immunity",
    prepTime: "5 min",
    ingredients: [
      "1 inch fresh ginger",
      "1 tsp turmeric powder",
      "Juice of 1 lemon",
      "Pinch of black pepper",
      "1 tsp raw honey",
      "2 tbsp water",
    ],
    steps: [
      { stepNumber: 1, instruction: "Juice the fresh ginger (or grate and squeeze through a cloth)." },
      { stepNumber: 2, instruction: "Combine ginger juice, turmeric, lemon juice, and water in a small glass." },
      { stepNumber: 3, instruction: "Add a pinch of black pepper (activates turmeric's benefits) and honey." },
      { stepNumber: 4, instruction: "Stir well until combined." },
      { stepNumber: 5, instruction: "Drink in one shot on an empty stomach for best absorption." },
    ],
    benefits: [
      "Vitamin C from lemon",
      "Anti-inflammatory turmeric",
      "Traditional immune support",
    ],
    safetyNote: "Strong and potent — dilute if too intense. Avoid daily high-dose turmeric during pregnancy.",
    whyItHelps: "Turmeric's curcumin may support immune cell function. Ginger provides antimicrobial compounds. Lemon delivers vitamin C. Black pepper boosts curcumin absorption by up to 20x.",
    bestTime: "First thing in the morning on an empty stomach, or at the first sign of seasonal illness.",
    imageUrl: "https://source.unsplash.com/600x400/?citrus,ginger,immunity,shot",
  },
  {
    id: "remedy-ashwagandha-milk",
    title: "Adaptogenic Moon Milk",
    description:
      "A nourishing bedtime milk with ashwagandha and warming spices to support deep rest.",
    category: "Sleep & Stress",
    prepTime: "8 min",
    ingredients: [
      "1 cup oat or almond milk",
      "1 tsp ashwagandha powder",
      "1/2 tsp cinnamon",
      "1/4 tsp cardamom",
      "1 tsp honey",
      "Pinch of nutmeg",
    ],
    steps: [
      { stepNumber: 1, instruction: "Heat oat milk in a small saucepan over medium-low heat. Do not boil." },
      { stepNumber: 2, instruction: "Whisk in ashwagandha powder, cinnamon, and cardamom." },
      { stepNumber: 3, instruction: "Continue stirring until fully blended and steaming.", duration: "3 minutes" },
      { stepNumber: 4, instruction: "Remove from heat. Add honey and a pinch of nutmeg." },
      { stepNumber: 5, instruction: "Pour into a mug and enjoy 30-60 minutes before bed." },
    ],
    benefits: [
      "Adaptogenic stress support",
      "Promotes relaxation",
      "Warming and nourishing",
    ],
    safetyNote: "Ashwagandha is generally well-tolerated. Consult a healthcare provider if pregnant or on thyroid medication.",
    whyItHelps: "Ashwagandha is a renowned adaptogen that may help regulate cortisol and support the body's stress response. Warming spices like cinnamon and cardamom aid in digestion and grounding.",
    bestTime: "30–60 minutes before your intended sleep time.",
    imageUrl: "https://source.unsplash.com/600x400/?ashwagandha,moon,milk,oat,warm",
  },
  {
    id: "remedy-energy-smoothie",
    title: "Green Energy Morning Smoothie",
    description:
      "A nutrient-dense smoothie to support sustained morning energy without the crash.",
    category: "Energy",
    prepTime: "5 min",
    ingredients: [
      "1 cup spinach or kale",
      "1 banana (frozen)",
      "1 tsp maca powder",
      "1 tbsp almond butter",
      "1 cup coconut water",
      "1/2 tsp spirulina (optional)",
    ],
    steps: [
      { stepNumber: 1, instruction: "Add coconut water to your blender first as the base." },
      { stepNumber: 2, instruction: "Add the leafy greens and blend until smooth.", duration: "30 seconds" },
      { stepNumber: 3, instruction: "Add frozen banana, maca powder, and almond butter." },
      { stepNumber: 4, instruction: "Blend until creamy. Add spirulina if using.", duration: "30 seconds" },
      { stepNumber: 5, instruction: "Pour into a glass and enjoy within 15 minutes for best nutritional value." },
    ],
    benefits: [
      "Sustained energy",
      "B vitamins from greens",
      "Adaptogenic maca support",
    ],
    safetyNote: "Great for most people. If new to spirulina, start with a small amount.",
    whyItHelps: "Maca root may support energy and vitality at the cellular level. Leafy greens provide iron and B vitamins essential for energy metabolism. Frozen banana adds natural sugars for quick fuel.",
    bestTime: "Within 30 minutes of waking — before or as your breakfast.",
    imageUrl: "https://source.unsplash.com/600x400/?green,smoothie,spinach,energy,morning",
  },
  {
    id: "remedy-elderberry-syrup",
    title: "Elderberry Immune Syrup",
    description:
      "A rich, antioxidant-dense syrup used traditionally across cultures to support immune resilience.",
    category: "Immunity",
    prepTime: "30 min",
    ingredients: [
      "1 cup dried elderberries",
      "3 cups filtered water",
      "1 tsp cinnamon",
      "1/2 tsp cloves",
      "1 inch fresh ginger",
      "1 cup raw honey (added after cooling)",
    ],
    steps: [
      { stepNumber: 1, instruction: "Combine elderberries, water, ginger, cinnamon, and cloves in a saucepan." },
      { stepNumber: 2, instruction: "Bring to a boil, then reduce to a simmer.", duration: "45 minutes" },
      { stepNumber: 3, instruction: "Mash the berries and strain through a fine-mesh sieve." },
      { stepNumber: 4, instruction: "Allow to cool to room temperature (important — heat destroys honey's enzymes)." },
      { stepNumber: 5, instruction: "Stir in raw honey. Store in a glass jar in the refrigerator for up to 3 months." },
    ],
    benefits: [
      "Rich in antioxidants",
      "Traditional immune support",
      "Anti-inflammatory properties",
    ],
    safetyNote: "Never use raw elderberries — they must be cooked first. Do not give honey to children under 1 year.",
    whyItHelps: "Elderberries are rich in anthocyanins and flavonoids that may support immune cell activity. Traditionally used at the onset of seasonal illness across European folk medicine.",
    bestTime: "1 tablespoon daily as prevention, or 3x daily at the first sign of illness.",
    imageUrl: "https://source.unsplash.com/600x400/?elderberry,purple,berry,syrup",
  },
  {
    id: "remedy-chamomile-sleep",
    title: "Deep Sleep Chamomile Blend",
    description:
      "A classic, trusted blend of chamomile and passionflower to ease the mind and invite deep sleep.",
    category: "Sleep",
    prepTime: "10 min",
    ingredients: [
      "2 tsp dried chamomile flowers",
      "1 tsp passionflower herb",
      "1 tsp lemon balm",
      "1 cup hot water (just below boiling)",
      "1 tsp honey",
    ],
    steps: [
      { stepNumber: 1, instruction: "Combine chamomile, passionflower, and lemon balm in a tea strainer." },
      { stepNumber: 2, instruction: "Pour water that's just below boiling over the herbs (90°C/194°F)." },
      { stepNumber: 3, instruction: "Cover and steep to keep volatile oils in the cup.", duration: "7 minutes" },
      { stepNumber: 4, instruction: "Remove strainer and allow to cool slightly." },
      { stepNumber: 5, instruction: "Add honey, hold the warm cup, take 3 deep breaths before your first sip." },
    ],
    benefits: [
      "Calms an overactive mind",
      "Supports sleep onset",
      "Gentle and caffeine-free",
    ],
    safetyNote: "Avoid if allergic to ragweed. Passionflower may enhance sedative medications.",
    whyItHelps: "Chamomile contains apigenin, which may bind to GABA receptors to promote relaxation. Passionflower has been traditionally used to ease anxiety-related sleeplessness.",
    bestTime: "45–60 minutes before your intended bedtime.",
    imageUrl: "https://source.unsplash.com/600x400/?chamomile,flower,herbal,tea,sleep",
  },
  {
    id: "remedy-turmeric-tonic",
    title: "Anti-Inflammatory Turmeric Tonic",
    description:
      "A vibrant daily tonic to support inflammation balance and overall cellular health.",
    category: "Immunity",
    prepTime: "5 min",
    ingredients: [
      "1 tsp turmeric powder",
      "Juice of 1/2 lemon",
      "1 tsp apple cider vinegar",
      "Pinch of black pepper",
      "1/2 tsp honey",
      "1 cup warm water",
    ],
    steps: [
      { stepNumber: 1, instruction: "Warm the water — not boiling, just comfortably warm." },
      { stepNumber: 2, instruction: "Add turmeric and black pepper and stir until dissolved." },
      { stepNumber: 3, instruction: "Add lemon juice and apple cider vinegar." },
      { stepNumber: 4, instruction: "Sweeten with honey and stir well." },
      { stepNumber: 5, instruction: "Drink immediately for best potency." },
    ],
    benefits: [
      "Anti-inflammatory support",
      "Digestive aid",
      "Liver support properties",
    ],
    safetyNote: "Apple cider vinegar is acidic — rinse mouth with water after. Avoid high-dose turmeric if taking blood thinners.",
    whyItHelps: "Curcumin in turmeric may help modulate inflammatory pathways. ACV may support healthy digestion and blood sugar balance. Together, they create a potent morning tonic.",
    bestTime: "First thing in the morning before eating, on an empty stomach.",
    imageUrl: "https://source.unsplash.com/600x400/?turmeric,golden,tonic,anti-inflammatory",
  },
];

export const PLANS: WellnessPlan[] = [
  {
    id: "plan-stress-3day",
    title: "3-Day Stress Relief",
    subtitle: "Reset your nervous system with gentle, natural support.",
    goal: "stress",
    duration: "3 days",
    imageUrl: "https://source.unsplash.com/600x400/?meditation,zen,calm,stress-relief",
    groceryList: [
      "Chamomile tea",
      "Lavender tea",
      "Ashwagandha powder",
      "Dark chocolate (70%+)",
      "Blueberries",
      "Oat milk",
      "Honey",
      "Magnesium supplement",
    ],
    days: [
      {
        day: 1,
        label: "Ground",
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
        day: 2,
        label: "Release",
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
        day: 3,
        label: "Restore",
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
    imageUrl: "https://source.unsplash.com/600x400/?sleep,moonlight,night,rest,peaceful",
    groceryList: [
      "Chamomile tea",
      "Valerian root tea",
      "Lemon balm tea",
      "Tart cherry juice",
      "Passionflower",
      "Magnesium supplement",
      "Oat milk",
      "Honey",
      "Lavender oil",
    ],
    days: [
      {
        day: 1,
        label: "Awareness",
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
    imageUrl: "https://source.unsplash.com/600x400/?sunrise,vitality,energy,morning,yoga",
    groceryList: [
      "Maca powder",
      "Green tea",
      "Spinach",
      "Kale",
      "Frozen bananas",
      "Almond butter",
      "Coconut water",
      "Walnuts",
      "Ginseng tea",
      "B-complex supplement",
    ],
    days: [
      {
        day: 1,
        label: "Energize",
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
  {
    id: "plan-immunity-14day",
    title: "14-Day Immunity Boost",
    subtitle: "Fortify your body's defenses with antioxidants and immune herbs.",
    goal: "immunity",
    duration: "14 days",
    imageUrl: "https://source.unsplash.com/600x400/?immunity,herbs,citrus,garlic,health",
    groceryList: [
      "Elderberry syrup or dried elderberries",
      "Echinacea tea",
      "Turmeric powder",
      "Fresh ginger",
      "Garlic",
      "Citrus fruits",
      "Vitamin D3 supplement",
      "Zinc supplement",
      "Shiitake mushrooms",
    ],
    days: [
      {
        day: 1,
        label: "Foundation",
        activities: [
          { id: "im14-1-1", time: "7:00 AM", title: "Immunity shot", description: "Start your day with the ginger-turmeric-lemon wellness shot.", category: "morning", duration: "2 min" },
          { id: "im14-1-2", time: "12:00 PM", title: "Add garlic to lunch", description: "Include 2 cloves of raw or cooked garlic in your midday meal.", category: "afternoon" },
          { id: "im14-1-3", time: "8:00 PM", title: "Elderberry syrup", description: "Take 1 tbsp elderberry syrup as a daily immune support ritual.", category: "evening", duration: "1 min" },
        ],
        foods: ["Citrus fruits", "Garlic", "Leafy greens", "Shiitake mushrooms"],
        teas: ["Elderberry & rosehip tea", "Turmeric golden milk"],
        supplements: ["Vitamin D3 (consult provider)", "Zinc (consult provider)"],
      },
    ],
  },
];

export const RECIPES: Recipe[] = [
  {
    id: "recipe-golden-milk",
    title: "Golden Turmeric Latte",
    description:
      "A warming, anti-inflammatory beverage traditionally used to support immunity and overall wellbeing.",
    category: "Drinks",
    prepTime: "5 min",
    goal: "immunity",
    imageUrl: "https://source.unsplash.com/600x400/?golden,milk,turmeric,warm,latte",
    whyItHelps: "Curcumin in turmeric may support immune function and reduce low-grade inflammation. Black pepper activates curcumin absorption by up to 20x.",
    bestTime: "Morning, afternoon, or before bed as a warming ritual.",
    ingredients: [
      "1 cup oat milk",
      "1 tsp turmeric powder",
      "1/2 tsp cinnamon",
      "1/4 tsp ginger powder",
      "Pinch of black pepper",
      "1 tsp honey or maple syrup",
    ],
    steps: [
      { stepNumber: 1, instruction: "Heat oat milk in a saucepan over medium heat. Do not boil." },
      { stepNumber: 2, instruction: "Whisk in turmeric, cinnamon, and ginger." },
      { stepNumber: 3, instruction: "Add black pepper and stir until combined.", duration: "2 minutes" },
      { stepNumber: 4, instruction: "Remove from heat and sweeten with honey." },
      { stepNumber: 5, instruction: "Pour into your favorite mug and enjoy warm." },
    ],
    variations: [
      "Add 1/2 tsp ashwagandha for extra adaptogenic support",
      "Use coconut milk for a richer, creamier texture",
      "Serve iced with ice cubes for a summer version",
    ],
    groceryList: ["Oat milk", "Turmeric powder", "Cinnamon", "Ginger powder", "Honey"],
  },
  {
    id: "recipe-immunity-broth",
    title: "Herbal Immunity Broth",
    description:
      "A deeply nourishing broth with herbs and vegetables traditionally used to support the body during illness and prevention.",
    category: "Soups",
    prepTime: "45 min",
    goal: "immunity",
    imageUrl: "https://source.unsplash.com/600x400/?broth,soup,bone,healing,nourishing",
    whyItHelps: "Garlic's allicin, turmeric's curcumin, and ginger's gingerols combine to create a powerful anti-microbial, anti-inflammatory base that may support immune defenses.",
    bestTime: "During periods of heightened immune need, or as a daily preventative in colder months.",
    ingredients: [
      "4 cups vegetable broth",
      "3 garlic cloves, minced",
      "1 inch fresh ginger",
      "1 tsp turmeric",
      "1 cup shiitake mushrooms",
      "1 lemon (juice)",
      "Fresh thyme or rosemary",
      "Sea salt to taste",
    ],
    steps: [
      { stepNumber: 1, instruction: "Bring vegetable broth to a simmer in a large pot." },
      { stepNumber: 2, instruction: "Add garlic, ginger, and mushrooms." },
      { stepNumber: 3, instruction: "Stir in turmeric and fresh herbs.", duration: "20 minutes" },
      { stepNumber: 4, instruction: "Reduce heat and let simmer on low.", duration: "20 minutes" },
      { stepNumber: 5, instruction: "Remove from heat, add lemon juice and salt. Strain if desired." },
    ],
    variations: [
      "Add a handful of spinach in the last 5 minutes",
      "Include 1 tbsp apple cider vinegar for extra gut support",
      "Make a big batch and freeze individual portions",
    ],
    groceryList: ["Vegetable broth", "Garlic", "Fresh ginger", "Turmeric", "Shiitake mushrooms", "Lemon", "Fresh thyme"],
  },
  {
    id: "recipe-overnight-oats",
    title: "Adaptogenic Overnight Oats",
    description:
      "A prep-ahead breakfast rich in fiber, adaptogens, and sustained energy — ready the moment you wake up.",
    category: "Breakfast",
    prepTime: "5 min (+ overnight)",
    goal: "energy",
    imageUrl: "https://source.unsplash.com/600x400/?oats,overnight,breakfast,bowl,berries",
    whyItHelps: "Maca may support energy and stamina. Chia seeds provide omega-3s and fiber for sustained fullness. Oats offer slow-release carbohydrates for steady morning energy.",
    bestTime: "First meal of the day — prep the night before for a seamless morning routine.",
    ingredients: [
      "1/2 cup rolled oats",
      "1 cup oat milk",
      "1 tsp maca powder",
      "1 tbsp chia seeds",
      "1 tbsp almond butter",
      "1 tsp honey",
      "Toppings: berries, nuts, granola",
    ],
    steps: [
      { stepNumber: 1, instruction: "Combine oats, oat milk, maca, and chia seeds in a jar." },
      { stepNumber: 2, instruction: "Stir well to combine. Add honey." },
      { stepNumber: 3, instruction: "Cover and refrigerate overnight.", duration: "8 hours" },
      { stepNumber: 4, instruction: "In the morning, add almond butter and stir." },
      { stepNumber: 5, instruction: "Top with berries, nuts, or your favorite toppings and enjoy." },
    ],
    variations: [
      "Add 1 tsp ashwagandha for stress-support",
      "Use coconut milk for a tropical flavor",
      "Add cacao powder for an antioxidant boost",
    ],
    groceryList: ["Rolled oats", "Oat milk", "Maca powder", "Chia seeds", "Almond butter", "Mixed berries", "Honey"],
  },
  {
    id: "recipe-antistress-salad",
    title: "Stress-Less Green Salad",
    description:
      "A nutrient-dense salad with magnesium-rich ingredients to support a calm, grounded nervous system.",
    category: "Meals",
    prepTime: "10 min",
    goal: "stress",
    imageUrl: "https://source.unsplash.com/600x400/?salad,greens,healthy,fresh,vegetables",
    whyItHelps: "Spinach and pumpkin seeds are rich in magnesium, which plays a key role in regulating the stress response. Walnuts provide omega-3s that may support brain health and mood.",
    bestTime: "Lunch or dinner — especially on high-stress days.",
    ingredients: [
      "2 cups baby spinach",
      "1/2 avocado",
      "1/4 cup walnuts",
      "1/4 cup blueberries",
      "1 tbsp pumpkin seeds",
      "Dressing: lemon, olive oil, honey, mustard",
    ],
    steps: [
      { stepNumber: 1, instruction: "Wash and dry spinach leaves." },
      { stepNumber: 2, instruction: "Slice avocado and add to the spinach." },
      { stepNumber: 3, instruction: "Top with walnuts, blueberries, and pumpkin seeds." },
      { stepNumber: 4, instruction: "Whisk lemon juice, olive oil, honey, and a touch of mustard." },
      { stepNumber: 5, instruction: "Drizzle dressing over salad and enjoy immediately." },
    ],
    variations: [
      "Add grilled salmon for omega-3 support",
      "Include roasted beets for extra antioxidants",
      "Top with dark chocolate shavings for a sweet touch",
    ],
    groceryList: ["Baby spinach", "Avocado", "Walnuts", "Blueberries", "Pumpkin seeds", "Lemon", "Olive oil"],
  },
  {
    id: "recipe-sleep-smoothie",
    title: "Cherry Sleep Smoothie",
    description:
      "A calming pre-bed smoothie with tart cherries and magnesium-rich banana to support your body's natural sleep cycle.",
    category: "Drinks",
    prepTime: "5 min",
    goal: "sleep",
    imageUrl: "https://source.unsplash.com/600x400/?smoothie,banana,cherry,sleep,purple",
    whyItHelps: "Tart cherries are one of the few natural food sources of melatonin. Combined with banana's tryptophan and magnesium, this smoothie gently supports sleep onset.",
    bestTime: "30–60 minutes before bed — avoid anything heavy after this.",
    ingredients: [
      "1/2 cup tart cherry juice (unsweetened)",
      "1 frozen banana",
      "1 cup oat milk",
      "1/2 tsp cinnamon",
      "1 tsp honey",
      "Ice cubes (optional)",
    ],
    steps: [
      { stepNumber: 1, instruction: "Add all ingredients to a blender." },
      { stepNumber: 2, instruction: "Blend until smooth and creamy.", duration: "30 seconds" },
      { stepNumber: 3, instruction: "Taste and adjust honey as needed." },
      { stepNumber: 4, instruction: "Pour into a glass and enjoy slowly, mindfully." },
      { stepNumber: 5, instruction: "Follow with your sleep preparation ritual — dim lights, no screens." },
    ],
    variations: [
      "Add 1/2 tsp ashwagandha for stress-support before sleep",
      "Include a handful of spinach for extra magnesium",
      "Use almond milk instead for fewer natural sugars",
    ],
    groceryList: ["Tart cherry juice", "Frozen banana", "Oat milk", "Cinnamon", "Honey"],
  },
  {
    id: "recipe-ginger-wellness",
    title: "Fresh Ginger Wellness Elixir",
    description:
      "A bold, invigorating morning elixir combining fresh ginger, lemon, and apple cider vinegar for a powerful daily reset.",
    category: "Drinks",
    prepTime: "5 min",
    goal: "energy",
    imageUrl: "https://source.unsplash.com/600x400/?ginger,lemon,wellness,drink,fresh",
    whyItHelps: "Ginger may stimulate circulation and digestion, while ACV may support blood sugar balance. Together they create a stimulating, energizing start to the day.",
    bestTime: "First thing in the morning before eating.",
    ingredients: [
      "1 inch fresh ginger (juiced or grated)",
      "Juice of 1 lemon",
      "1 tbsp apple cider vinegar",
      "1 tsp honey",
      "1 cup warm water",
      "Pinch of cayenne (optional)",
    ],
    steps: [
      { stepNumber: 1, instruction: "Juice or finely grate the ginger and press through a cloth to extract juice." },
      { stepNumber: 2, instruction: "Add ginger juice, lemon, ACV, and honey to a glass." },
      { stepNumber: 3, instruction: "Pour warm (not boiling) water over the mixture." },
      { stepNumber: 4, instruction: "Add a pinch of cayenne for an extra kick if desired." },
      { stepNumber: 5, instruction: "Stir and drink immediately." },
    ],
    variations: [
      "Add 1/2 tsp turmeric for anti-inflammatory benefits",
      "Use sparkling water for a refreshing morning fizz",
      "Add fresh mint leaves for a cooling variation",
    ],
    groceryList: ["Fresh ginger", "Lemons", "Apple cider vinegar", "Honey", "Cayenne pepper"],
  },
  {
    id: "recipe-adaptogen-bowl",
    title: "Adaptogenic Power Bowl",
    description:
      "A nourishing grain bowl packed with stress-busting adaptogens, healthy fats, and anti-inflammatory spices.",
    category: "Meals",
    prepTime: "20 min",
    goal: "stress",
    imageUrl: "https://source.unsplash.com/600x400/?acai,bowl,superfoods,adaptogen,fruit",
    whyItHelps: "Adaptogens like ashwagandha help modulate the stress response. Sweet potato provides complex carbs that support serotonin production. Tahini provides magnesium and healthy fats.",
    bestTime: "Lunch or dinner during high-stress periods.",
    ingredients: [
      "1 cup cooked quinoa or brown rice",
      "1 roasted sweet potato",
      "1/2 cup chickpeas (roasted)",
      "1/2 avocado",
      "1 tsp ashwagandha powder",
      "Tahini dressing: tahini, lemon, garlic, water",
      "Toppings: sesame seeds, fresh herbs",
    ],
    steps: [
      { stepNumber: 1, instruction: "Cook quinoa or rice per package directions." },
      { stepNumber: 2, instruction: "Roast sweet potato cubes at 200°C/400°F until golden.", duration: "25 minutes" },
      { stepNumber: 3, instruction: "Blend tahini dressing with lemon, garlic, and a pinch of ashwagandha." },
      { stepNumber: 4, instruction: "Assemble bowl: grains, sweet potato, chickpeas, avocado." },
      { stepNumber: 5, instruction: "Drizzle with adaptogenic tahini dressing and top with sesame seeds." },
    ],
    variations: [
      "Swap chickpeas for lentils for extra iron",
      "Add a soft-boiled egg for protein",
      "Include roasted beets for antioxidant support",
    ],
    groceryList: ["Quinoa", "Sweet potato", "Chickpeas", "Avocado", "Tahini", "Ashwagandha powder", "Lemon", "Garlic"],
  },
  {
    id: "recipe-elderberry-tea",
    title: "Elderberry & Rosehip Immunity Tea",
    description:
      "A vitamin C-rich, antioxidant-dense tea blend traditionally used to fortify the body's defenses.",
    category: "Drinks",
    prepTime: "10 min",
    goal: "immunity",
    imageUrl: "https://source.unsplash.com/600x400/?elderberry,tea,rosehip,vitamin,herbal",
    whyItHelps: "Elderberry contains immune-supporting flavonoids. Rosehip is exceptionally high in vitamin C. Together they provide a potent antioxidant and immune support combination.",
    bestTime: "Daily as a preventative, or 3x daily at the onset of seasonal illness.",
    ingredients: [
      "1 tsp dried elderberries",
      "1 tsp dried rosehip",
      "1/2 tsp hibiscus flowers",
      "1 cup hot water",
      "1 tsp honey",
      "Slice of orange (optional)",
    ],
    steps: [
      { stepNumber: 1, instruction: "Combine elderberries, rosehip, and hibiscus in a tea infuser." },
      { stepNumber: 2, instruction: "Pour hot (not boiling) water over the blend." },
      { stepNumber: 3, instruction: "Cover and steep to preserve antioxidants.", duration: "10 minutes" },
      { stepNumber: 4, instruction: "Remove infuser and add honey." },
      { stepNumber: 5, instruction: "Add an orange slice for extra vitamin C and enjoy warm." },
    ],
    variations: [
      "Add fresh ginger slices for extra warmth and immune support",
      "Brew stronger for a juice concentrate to sip throughout the day",
      "Chill and serve as iced tea in summer",
    ],
    groceryList: ["Dried elderberries", "Dried rosehip", "Hibiscus flowers", "Honey"],
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

const DEFAULT_FALLBACK_URL =
  "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=600&q=80&fit=crop";

const IMAGE_KEYWORDS: Record<string, string> = {
  ginger:     "https://images.unsplash.com/photo-1548199569-3e1c6aa8f469?w=600&q=80&fit=crop",
  chamomile:  "https://images.unsplash.com/photo-1471091862366-7a1b48c6a3cd?w=600&q=80&fit=crop",
  lavender:   "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80&fit=crop",
  turmeric:   "https://images.unsplash.com/photo-1536304993831-10cdf90fbfb5?w=600&q=80&fit=crop",
  ashwagandha:"https://images.unsplash.com/photo-1544991936-9464e43bea92?w=600&q=80&fit=crop",
  elderberry: "https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=600&q=80&fit=crop",
  berry:      "https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=600&q=80&fit=crop",
  smoothie:   "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80&fit=crop",
  green:      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80&fit=crop",
  lemon:      "https://images.unsplash.com/photo-1548199569-3e1c6aa8f469?w=600&q=80&fit=crop",
  immunity:   "https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=600&q=80&fit=crop",
  garlic:     "https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=600&q=80&fit=crop",
  sleep:      "https://images.unsplash.com/photo-1471091862366-7a1b48c6a3cd?w=600&q=80&fit=crop",
  energy:     "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80&fit=crop",
  stress:     "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80&fit=crop",
  tea:        "https://images.unsplash.com/photo-1548199569-3e1c6aa8f469?w=600&q=80&fit=crop",
  adaptogen:  "https://images.unsplash.com/photo-1544991936-9464e43bea92?w=600&q=80&fit=crop",
};

function getCategoryFallback(category: string): string {
  const cat = (category ?? "").toLowerCase();
  if (cat.includes("stress") && cat.includes("sleep")) return IMAGE_KEYWORDS.lavender;
  if (cat.includes("stress")) return IMAGE_KEYWORDS.stress;
  if (cat.includes("sleep")) return IMAGE_KEYWORDS.sleep;
  if (cat.includes("energy") || cat.includes("drinks")) return IMAGE_KEYWORDS.smoothie;
  if (cat.includes("immun")) return IMAGE_KEYWORDS.immunity;
  if (cat.includes("digest")) return IMAGE_KEYWORDS.tea;
  return DEFAULT_FALLBACK_URL;
}

function getRelevantImage(item: {
  imageUrl?: string;
  title?: string;
  ingredients?: string[];
  category?: string;
  goal?: string;
}): string {
  const searchIn = (text: string): string | null => {
    const lower = text.toLowerCase();
    for (const [kw, url] of Object.entries(IMAGE_KEYWORDS)) {
      if (lower.includes(kw)) return url;
    }
    return null;
  };

  if (item.ingredients) {
    for (const ing of item.ingredients) {
      const match = searchIn(ing);
      if (match) return match;
    }
  }

  if (item.title) {
    const match = searchIn(item.title);
    if (match) return match;
  }

  return getCategoryFallback(item.category ?? item.goal ?? "");
}

export function getSafeImage(item: {
  imageUrl?: string;
  category?: string;
  goal?: string;
  title?: string;
  ingredients?: string[];
}): string {
  const url = item.imageUrl;
  if (url && url.trim().length > 5) return url;
  return getRelevantImage(item);
}

export function getImageUrl(category: string, provided?: string): string {
  if (provided && provided.trim().length > 0) return provided;
  return getCategoryFallback(category);
}

export function getItemImage(item: { title?: string }, index: number): string {
  let query = "herbal tea";
  const title = (item.title || "").toLowerCase();
  if (title.includes("sleep")) query = "chamomile tea";
  else if (title.includes("energy")) query = "green smoothie";
  else if (title.includes("immunity")) query = "berries healthy";
  else if (title.includes("ginger") || title.includes("digest")) query = "ginger tea";
  else if (title.includes("lavender") || title.includes("calm")) query = "lavender tea";
  else if (title.includes("stress")) query = "relaxing tea";
  const uniqueSig = index;
  return `https://source.unsplash.com/600x400/?${encodeURIComponent(query)}&sig=${uniqueSig}`;
}

export { DEFAULT_FALLBACK_URL };
