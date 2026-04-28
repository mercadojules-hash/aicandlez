export interface BreathPhase {
  label: string;
  duration: number;
  instruction: string;
}

export interface BreathPattern {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  description: string;
  benefits: string[];
  totalCycles: number;
  phases: BreathPhase[];
}

export const breathPatterns: BreathPattern[] = [
  {
    id: "box-breathing",
    title: "Box Breathing",
    subtitle: "Navy SEAL stress control technique",
    icon: "square",
    color: "#4ead7c",
    description:
      "Box breathing is used by Navy SEALs and elite athletes to rapidly calm the nervous system and regain focus under pressure. Four equal sides — inhale, hold, exhale, hold.",
    benefits: ["Reduces acute stress", "Sharpens focus", "Balances the nervous system", "Lowers heart rate"],
    totalCycles: 6,
    phases: [
      { label: "Inhale", duration: 4, instruction: "Breathe in slowly through your nose" },
      { label: "Hold", duration: 4, instruction: "Hold the breath, stay relaxed" },
      { label: "Exhale", duration: 4, instruction: "Breathe out fully through your mouth" },
      { label: "Hold", duration: 4, instruction: "Hold empty, stay calm" },
    ],
  },
  {
    id: "478-breathing",
    title: "4-7-8 Breathing",
    subtitle: "Dr. Andrew Weil's sleep technique",
    icon: "activity",
    color: "#7c6ead",
    description:
      "Developed by Dr. Andrew Weil, this technique acts as a natural tranquilizer for the nervous system. The extended exhale activates the parasympathetic nervous system, inducing relaxation within minutes.",
    benefits: ["Induces sleep", "Reduces anxiety", "Controls cravings", "Lowers blood pressure"],
    totalCycles: 4,
    phases: [
      { label: "Inhale", duration: 4, instruction: "Inhale quietly through your nose" },
      { label: "Hold", duration: 7, instruction: "Hold your breath gently" },
      { label: "Exhale", duration: 8, instruction: "Exhale completely through your mouth with a whoosh" },
    ],
  },
  {
    id: "calm-breathing",
    title: "Calm Breathing",
    subtitle: "Simple anxiety relief anytime",
    icon: "wind",
    color: "#6ea8ed",
    description:
      "Also known as resonance breathing, this simple technique slows your breathing to 5–6 cycles per minute, synchronizing heart rate with breath and activating deep relaxation.",
    benefits: ["Immediate calm", "Easy to learn", "Works anywhere", "Reduces chronic anxiety"],
    totalCycles: 8,
    phases: [
      { label: "Inhale", duration: 4, instruction: "Breathe in gently and fully" },
      { label: "Exhale", duration: 6, instruction: "Breathe out slowly, longer than your inhale" },
    ],
  },
];
