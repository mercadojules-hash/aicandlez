export interface WeekData {
  week: number;
  title: string;
  image: string;
  days: string[];
}

export const JOURNEY_WEEKS: WeekData[] = [
  {
    week: 1,
    title: "Foundation",
    image: "https://apexdigital.design/wp-content/uploads/2026/04/natura-plan-week-1.webp",
    days: [
      "Breath Awareness",
      "Gentle Stretch",
      "Relax & Reset",
      "Breath Control",
      "Light Flow",
      "Recovery",
      "Full Reset",
    ],
  },
  {
    week: 2,
    title: "Energy",
    image: "https://apexdigital.design/wp-content/uploads/2026/04/natura-plan-week-2.webp",
    days: [
      "Morning Flow",
      "Strength Build",
      "Core Activation",
      "Energy Boost",
      "Full Body Flow",
      "Active Recovery",
      "Power Reset",
    ],
  },
  {
    week: 3,
    title: "Focus",
    image: "https://apexdigital.design/wp-content/uploads/2026/04/natura-plan-week-3.webp",
    days: [
      "Mindful Breathing",
      "Focus Flow",
      "Stillness Practice",
      "Clarity Reset",
      "Balance Focus",
      "Deep Breath",
      "Mind Reset",
    ],
  },
  {
    week: 4,
    title: "Balance",
    image: "https://apexdigital.design/wp-content/uploads/2026/04/natura-plan-week-4.webp",
    days: [
      "Balance Flow",
      "Deep Stretch",
      "Full Integration",
      "Strength + Calm",
      "Flow & Breath",
      "Recovery",
      "Final Reset",
    ],
  },
];
