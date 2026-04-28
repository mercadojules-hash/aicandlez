export interface Pose {
  name: string;
  instruction: string;
  duration: number;
  breathInstruction: string;
  holdCue?: string;
}

export interface YogaFlow {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  level: string;
  icon: string;
  color: string;
  description: string;
  benefits: string[];
  poses: Pose[];
}

export const yogaFlows: YogaFlow[] = [
  {
    id: "morning-energy",
    title: "Morning Energy Flow",
    subtitle: "Awaken your body and mind",
    duration: "15 min",
    level: "Beginner",
    icon: "sun",
    color: "#c8a96e",
    description:
      "Start your day with intention. This gentle yet energizing sequence awakens your spine, opens your chest, and sets a calm, focused tone for the hours ahead.",
    benefits: ["Boosts energy", "Improves focus", "Opens the spine", "Reduces morning stiffness"],
    poses: [
      {
        name: "Mountain Pose",
        instruction:
          "Stand tall with feet hip-width apart. Root through all four corners of your feet. Engage your thighs, lengthen your spine, and relax your shoulders away from your ears.",
        duration: 30,
        breathInstruction: "Take 5 deep, slow breaths",
        holdCue: "Feel grounded and present",
      },
      {
        name: "Sun Salutation Arms",
        instruction:
          "Inhale as you sweep your arms out wide and up overhead, palms touching. Gaze up gently and feel the stretch through your whole front body.",
        duration: 20,
        breathInstruction: "Inhale as arms rise",
        holdCue: "Reach fingertips toward the sky",
      },
      {
        name: "Standing Forward Fold",
        instruction:
          "Exhale and hinge at your hips, folding forward. Bend your knees generously. Let your head hang heavy and release all tension from your neck and shoulders.",
        duration: 30,
        breathInstruction: "Exhale completely, soften deeper",
        holdCue: "Let gravity do the work",
      },
      {
        name: "Low Lunge — Right",
        instruction:
          "Step your right foot back into a low lunge. Lower your right knee to the mat. Lift your chest and breathe into the front of your left hip.",
        duration: 40,
        breathInstruction: "Breathe into the hip flexor",
        holdCue: "Sink deeper on each exhale",
      },
      {
        name: "Downward Facing Dog",
        instruction:
          "Tuck your back toes and lift your hips high. Press firmly through both palms. Pedal your feet to warm up the calves and hamstrings.",
        duration: 45,
        breathInstruction: "5 steady breaths, lengthen each exhale",
        holdCue: "Create an inverted V shape",
      },
      {
        name: "Low Lunge — Left",
        instruction:
          "Step your left foot back and lower the left knee. Open your chest and breathe into the front of the right hip. Feel the balance on both sides of your body.",
        duration: 40,
        breathInstruction: "Breathe into the hip flexor",
        holdCue: "Find equal length on both sides",
      },
      {
        name: "Cat-Cow Flow",
        instruction:
          "Come to hands and knees. On inhale, drop your belly and lift your gaze — Cow. On exhale, round your spine to the sky — Cat. Move with your breath.",
        duration: 45,
        breathInstruction: "Inhale for Cow, exhale for Cat",
        holdCue: "Sync perfectly with each breath",
      },
      {
        name: "Child's Pose",
        instruction:
          "Sink your hips back toward your heels and extend your arms forward. Let your forehead rest on the mat. Breathe into your lower back.",
        duration: 40,
        breathInstruction: "Breathe deep into your lower back",
        holdCue: "Complete surrender and rest",
      },
      {
        name: "Seated Twist — Both Sides",
        instruction:
          "Sit with legs extended. Bend your right knee and cross it over your left leg. Place your left elbow outside your right knee and twist gently. Repeat other side.",
        duration: 50,
        breathInstruction: "Inhale to lengthen, exhale to twist deeper",
        holdCue: "Wring out stagnant energy",
      },
      {
        name: "Savasana",
        instruction:
          "Lie flat on your back, arms slightly away from your sides, palms up. Close your eyes. Completely release every muscle. You are done.",
        duration: 60,
        breathInstruction: "Natural breathing, no effort",
        holdCue: "Let go of everything",
      },
    ],
  },
  {
    id: "stress-relief",
    title: "Stress Relief Flow",
    subtitle: "Melt away tension and anxiety",
    duration: "20 min",
    level: "All Levels",
    icon: "wind",
    color: "#4ead7c",
    description:
      "This deeply restorative practice targets the areas where stress lives — the hips, shoulders, and neck. Each pose is held longer to allow your nervous system to genuinely unwind.",
    benefits: ["Reduces cortisol", "Releases hip tension", "Calms the nervous system", "Eases shoulder tightness"],
    poses: [
      {
        name: "Easy Seated Pose",
        instruction:
          "Sit cross-legged on your mat. Place your hands on your knees, palms up. Close your eyes. Simply notice your body without judgment.",
        duration: 45,
        breathInstruction: "Natural, easy breathing to begin",
        holdCue: "Arrive in the present moment",
      },
      {
        name: "Neck Rolls",
        instruction:
          "Gently drop your right ear toward your right shoulder. Breathe into the left side of your neck. Slowly roll your chin down to your chest, then to the left side.",
        duration: 40,
        breathInstruction: "Slow, deliberate breaths",
        holdCue: "No forcing, just gravity",
      },
      {
        name: "Seated Side Stretch",
        instruction:
          "Reach your right arm overhead and lean gently to the left. Feel the stretch along your right side body. Plant your left hand on the mat for support.",
        duration: 35,
        breathInstruction: "Breathe into the stretching side",
        holdCue: "Create space between each rib",
      },
      {
        name: "Butterfly Pose",
        instruction:
          "Bring the soles of your feet together and let your knees fall open like wings. Hold your feet and gently fold forward. Soften everything — your face, your jaw, your belly.",
        duration: 60,
        breathInstruction: "Long slow exhales to soften further",
        holdCue: "Surrender the inner thighs",
      },
      {
        name: "Lizard Pose — Right",
        instruction:
          "From a lunge, place both hands inside your right foot. Drop your back knee down. You can stay on hands or come down to forearms for a deeper release.",
        duration: 55,
        breathInstruction: "Breathe into the outer hip",
        holdCue: "Melt with every exhale",
      },
      {
        name: "Lizard Pose — Left",
        instruction:
          "Repeat on the left side. Place both hands inside your left foot. Notice which side holds more tension — breathe directly into that area.",
        duration: 55,
        breathInstruction: "Breathe into the outer hip",
        holdCue: "Equal attention on both sides",
      },
      {
        name: "Legs Up The Wall",
        instruction:
          "Lie on your back and extend your legs up toward the ceiling (or rest them against a wall). Completely relax your arms by your sides. This pose reverses blood flow and soothes anxiety.",
        duration: 90,
        breathInstruction: "Slow 4-count inhale, 6-count exhale",
        holdCue: "Let your nervous system reset",
      },
      {
        name: "Supine Twist — Both Sides",
        instruction:
          "Draw your right knee to your chest and guide it across your body with your left hand. Extend your right arm out. Look over your right shoulder. Breathe.",
        duration: 60,
        breathInstruction: "Inhale to lengthen spine, exhale into twist",
        holdCue: "Wring out the day's tension",
      },
      {
        name: "Savasana",
        instruction:
          "Lie completely still. Eyes closed. Body fully released. You have done the work. Now simply be.",
        duration: 90,
        breathInstruction: "Natural, effortless breathing",
        holdCue: "Perfect stillness, perfect rest",
      },
    ],
  },
  {
    id: "sleep-wind-down",
    title: "Sleep Wind Down",
    subtitle: "Prepare body and mind for rest",
    duration: "12 min",
    level: "Gentle",
    icon: "moon",
    color: "#7c6ead",
    description:
      "This slow, restorative sequence signals your nervous system that it is safe to rest. Dim your lights, soften your gaze, and let each pose carry you closer to sleep.",
    benefits: ["Induces deep sleep", "Quiets racing thoughts", "Releases physical tension", "Lowers heart rate"],
    poses: [
      {
        name: "Reclining Bound Angle",
        instruction:
          "Lie on your back. Bring the soles of your feet together and let your knees fall open. Place one hand on your heart, one on your belly. Close your eyes.",
        duration: 60,
        breathInstruction: "Feel your belly rise and fall",
        holdCue: "You are safe, you are held",
      },
      {
        name: "Knees to Chest",
        instruction:
          "Hug both knees to your chest. Rock gently side to side to massage your lower back. This releases the lumbar spine from the day's compression.",
        duration: 40,
        breathInstruction: "Exhale completely, compress gently",
        holdCue: "Rock slowly like a cradle",
      },
      {
        name: "Happy Baby",
        instruction:
          "Hold the outer edges of your feet. Draw your knees toward your armpits. Rock gently side to side. This is one of the most calming poses for the nervous system.",
        duration: 50,
        breathInstruction: "Slow natural breathing",
        holdCue: "Release all effort",
      },
      {
        name: "Supine Twist — Right",
        instruction:
          "Cross your right knee over to the left. Extend your right arm. Let gravity do all the work — no forcing, just softening.",
        duration: 50,
        breathInstruction: "Exhale releases you deeper",
        holdCue: "Ground both shoulders",
      },
      {
        name: "Supine Twist — Left",
        instruction:
          "Cross your left knee over to the right. Extend your left arm. Allow the same softening on this side. Notice any difference between sides.",
        duration: 50,
        breathInstruction: "Match the depth of the right side",
        holdCue: "Complete symmetry and balance",
      },
      {
        name: "Legs Up",
        instruction:
          "Extend both legs toward the ceiling. Flex and point your feet a few times, then let them completely relax. Rest your arms by your sides.",
        duration: 60,
        breathInstruction: "4-count inhale, 8-count exhale",
        holdCue: "Drain the day from your legs",
      },
      {
        name: "Savasana for Sleep",
        instruction:
          "Lower your legs and lie flat. Cover yourself with a blanket if you like. Allow your body to become heavy. You may drift off — that is perfect.",
        duration: 120,
        breathInstruction: "Let breathing become automatic",
        holdCue: "Nothing left to do",
      },
    ],
  },
];
