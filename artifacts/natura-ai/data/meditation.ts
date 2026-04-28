export interface MeditationSession {
  id: string;
  title: string;
  subtitle: string;
  duration: number;
  icon: string;
  color: string;
  description: string;
  steps: { text: string; duration: number }[];
}

export const meditationSessions: MeditationSession[] = [
  {
    id: "morning-clarity",
    title: "Morning Clarity",
    subtitle: "Set your intention for the day",
    duration: 180,
    icon: "sun",
    color: "#c8a96e",
    description: "A gentle morning meditation to center your mind and set a clear, purposeful intention.",
    steps: [
      { text: "Find a comfortable seated position. Close your eyes gently.", duration: 15 },
      { text: "Take three deep breaths. Let each exhale release any tension.", duration: 20 },
      { text: "Scan your body from head to toe. Notice without judgment.", duration: 25 },
      { text: "Bring your awareness to your heart center. What do you truly want today?", duration: 30 },
      { text: "Visualize your day unfolding with ease and grace.", duration: 35 },
      { text: "Set one clear intention for today. Hold it gently in your mind.", duration: 25 },
      { text: "Take a deep breath in… and slowly open your eyes.", duration: 15 },
    ],
  },
  {
    id: "stress-release",
    title: "Stress Release",
    subtitle: "Dissolve tension in 5 minutes",
    duration: 300,
    icon: "cloud",
    color: "#4ead7c",
    description: "A calming body-scan meditation that systematically releases tension from every part of your body.",
    steps: [
      { text: "Lie down or sit comfortably. Allow your body to be completely supported.", duration: 20 },
      { text: "Close your eyes and take five slow, deep breaths.", duration: 30 },
      { text: "Bring attention to your feet. With each exhale, let them soften completely.", duration: 35 },
      { text: "Move attention to your legs and hips. Let them become heavy and still.", duration: 35 },
      { text: "Notice your belly. Let it be soft. There is nothing to hold here.", duration: 30 },
      { text: "Bring awareness to your chest. Your heart is safe. Let it open.", duration: 35 },
      { text: "Release your shoulders down. Your arms become heavy. Your hands relax.", duration: 35 },
      { text: "Soften your face — your jaw, your brow, your eyes.", duration: 30 },
      { text: "Your whole body is now at peace. Rest here. You are safe.", duration: 30 },
    ],
  },
  {
    id: "sleep-meditation",
    title: "Sleep Journey",
    subtitle: "Drift into deep, restful sleep",
    duration: 300,
    icon: "moon",
    color: "#7c6ead",
    description: "A soothing guided meditation designed to quiet the mind and ease your body into deep, restful sleep.",
    steps: [
      { text: "Lie down comfortably. Pull your blanket close. You are safe here.", duration: 20 },
      { text: "Close your eyes. Let your body sink into the surface beneath you.", duration: 20 },
      { text: "Breathe in for 4 counts… hold for 4… and breathe out for 8.", duration: 30 },
      { text: "Imagine a warm golden light starting at the top of your head.", duration: 30 },
      { text: "The light moves slowly down your face… your neck… your shoulders.", duration: 35 },
      { text: "It flows through your chest… your belly… your lower back.", duration: 35 },
      { text: "Down through your hips… your thighs… your calves… your feet.", duration: 35 },
      { text: "Your entire body glows with warmth. Every cell is at peace.", duration: 30 },
      { text: "There is nothing to do. Nowhere to be. Let yourself drift away.", duration: 35 },
    ],
  },
];
