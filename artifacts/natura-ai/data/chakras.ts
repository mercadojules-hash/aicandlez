export interface Chakra {
  id: string;
  number: number;
  name: string;
  sanskrit: string;
  location: string;
  color: string;
  element: string;
  meaning: string;
  emotionalAssociation: string;
  blockingSigns: string[];
  affirmation: string;
  foods: string[];
  poses: string[];
  mantra: string;
}

export const chakras: Chakra[] = [
  {
    id: "root",
    number: 1,
    name: "Root Chakra",
    sanskrit: "Muladhara",
    location: "Base of spine",
    color: "#e53935",
    element: "Earth",
    meaning:
      "The Root Chakra is your foundation — your sense of safety, security, and belonging in the physical world. It connects you to the earth and to your most basic survival needs.",
    emotionalAssociation:
      "Security, stability, trust, grounding, physical safety, financial security, and a sense of home",
    blockingSigns: ["Anxiety and fear", "Financial insecurity", "Feeling ungrounded", "Lower back pain", "Fatigue"],
    affirmation: "I am safe. I am grounded. I belong here.",
    foods: ["Root vegetables", "Red foods", "Beets", "Radishes", "Carrots", "Potatoes", "Protein-rich foods"],
    poses: ["Mountain Pose", "Warrior I", "Child's Pose", "Seated Forward Fold", "Squat"],
    mantra: "LAM",
  },
  {
    id: "sacral",
    number: 2,
    name: "Sacral Chakra",
    sanskrit: "Svadhisthana",
    location: "Lower abdomen, 2 inches below navel",
    color: "#ff7043",
    element: "Water",
    meaning:
      "The Sacral Chakra governs creativity, sensuality, pleasure, and emotional flow. It is the seat of your passion and your ability to experience joy and connection with others.",
    emotionalAssociation:
      "Creativity, pleasure, desire, intimacy, emotional fluidity, and the ability to give and receive",
    blockingSigns: [
      "Creative blocks",
      "Intimacy issues",
      "Emotional numbness",
      "Lower back pain",
      "Hip tightness",
    ],
    affirmation: "I embrace my creativity. I allow myself to feel.",
    foods: ["Orange foods", "Oranges", "Mangoes", "Carrots", "Pumpkin", "Passion fruit", "Seeds"],
    poses: ["Pigeon Pose", "Bound Angle", "Hip Circles", "Low Lunge", "Goddess Pose"],
    mantra: "VAM",
  },
  {
    id: "solar-plexus",
    number: 3,
    name: "Solar Plexus Chakra",
    sanskrit: "Manipura",
    location: "Upper abdomen, above navel",
    color: "#ffd600",
    element: "Fire",
    meaning:
      "The Solar Plexus is your personal power center — your sense of self, confidence, and will. When balanced, you act from a place of strength and authentic purpose.",
    emotionalAssociation:
      "Confidence, self-esteem, personal power, discipline, decisiveness, and healthy boundaries",
    blockingSigns: [
      "Low self-esteem",
      "Indecision",
      "Digestive issues",
      "Need for control",
      "Feeling powerless",
    ],
    affirmation: "I am powerful. I trust myself completely.",
    foods: ["Yellow foods", "Bananas", "Corn", "Pineapple", "Ginger", "Turmeric", "Whole grains", "Legumes"],
    poses: ["Boat Pose", "Warrior III", "Plank", "Triangle Pose", "Twists"],
    mantra: "RAM",
  },
  {
    id: "heart",
    number: 4,
    name: "Heart Chakra",
    sanskrit: "Anahata",
    location: "Center of the chest",
    color: "#43a047",
    element: "Air",
    meaning:
      "The Heart Chakra bridges the physical and spiritual realms. It is the home of love — both for others and for yourself. An open heart chakra allows you to give and receive without fear.",
    emotionalAssociation:
      "Unconditional love, compassion, empathy, forgiveness, joy, and inner peace",
    blockingSigns: [
      "Difficulty forgiving",
      "Feeling isolated",
      "Jealousy",
      "Chest tightness",
      "Trouble trusting",
    ],
    affirmation: "I am love. I give and receive love freely.",
    foods: ["Green foods", "Leafy greens", "Broccoli", "Avocado", "Green tea", "Herbs", "Heart-healthy foods"],
    poses: ["Camel Pose", "Cobra", "Bridge Pose", "Eagle Arms", "Wild Thing"],
    mantra: "YAM",
  },
  {
    id: "throat",
    number: 5,
    name: "Throat Chakra",
    sanskrit: "Vishuddha",
    location: "Throat",
    color: "#1e88e5",
    element: "Ether",
    meaning:
      "The Throat Chakra is the center of communication, truth, and authentic expression. When open, you speak your truth with clarity and listen with genuine presence.",
    emotionalAssociation:
      "Communication, self-expression, honesty, listening, creativity through voice, and authentic truth",
    blockingSigns: [
      "Difficulty speaking up",
      "Fear of judgment",
      "Sore throat",
      "Neck tension",
      "Feeling unheard",
    ],
    affirmation: "I speak my truth. My voice matters.",
    foods: ["Blue and purple foods", "Blueberries", "Blackberries", "Figs", "Herbal teas", "Raw honey"],
    poses: ["Fish Pose", "Shoulder Stand", "Neck Rolls", "Lion's Breath", "Plow Pose"],
    mantra: "HAM",
  },
  {
    id: "third-eye",
    number: 6,
    name: "Third Eye Chakra",
    sanskrit: "Ajna",
    location: "Between the eyebrows",
    color: "#5e35b1",
    element: "Light",
    meaning:
      "The Third Eye is the seat of intuition, wisdom, and inner vision. It connects you to a deeper knowing beyond the rational mind — your inner guidance system.",
    emotionalAssociation:
      "Intuition, perception, imagination, clarity, wisdom, and the ability to see beyond the obvious",
    blockingSigns: [
      "Mental fog",
      "Lack of intuition",
      "Headaches",
      "Overthinking",
      "Disconnection from inner knowing",
    ],
    affirmation: "I trust my intuition. I see clearly.",
    foods: ["Indigo foods", "Eggplant", "Purple cabbage", "Grapes", "Dark chocolate", "Omega-3 rich foods"],
    poses: ["Child's Pose with forehead on mat", "Dolphin Pose", "Seated Meditation", "Forward Fold", "Eagle Pose"],
    mantra: "OM",
  },
  {
    id: "crown",
    number: 7,
    name: "Crown Chakra",
    sanskrit: "Sahasrara",
    location: "Top of the head",
    color: "#8e24aa",
    element: "Consciousness",
    meaning:
      "The Crown Chakra connects you to universal consciousness, spiritual wisdom, and the divine. It is the gateway to enlightenment and your highest self.",
    emotionalAssociation:
      "Spiritual connection, unity, bliss, transcendence, universal love, and presence",
    blockingSigns: [
      "Feeling spiritually disconnected",
      "Cynicism",
      "Closed-mindedness",
      "Chronic headaches",
      "Existential depression",
    ],
    affirmation: "I am connected to all that is. I am light.",
    foods: ["Fasting and detox", "Light foods", "Fresh air", "Sunlight", "Stillness", "Meditation"],
    poses: ["Savasana", "Headstand", "Lotus Pose", "Seated Meditation", "Tree Pose"],
    mantra: "OM (silence)",
  },
];
