import { db } from "@workspace/db";
import {
  jarvisBusinessesTable,
  jarvisBrandProfilesTable,
  jarvisAgentsTable,
  jarvisBudgetsTable,
  type InsertJarvisBrandProfile,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { recordBusinessMemory } from "../memory.js";

/**
 * Idempotent seed for the Creative Intelligence Division. Safe to re-run (dev
 * push + prod deploy): businesses upsert by slug, brand profiles by businessId,
 * agents by name, and the cognition budget is created only when absent. Seeded
 * brand profiles are EDITABLE STARTING DEFAULTS — advisory guidance the executive
 * refines, never asserted as grounded fact. Never writes secrets.
 */

const SEED_CREATED_BY = "jarvis-creative-seed";

interface BusinessSeed {
  slug: string;
  name: string;
  description: string;
  brand: Omit<InsertJarvisBrandProfile, "businessId" | "brandName"> & {
    brandName: string;
  };
}

const BUSINESS_SEEDS: BusinessSeed[] = [
  {
    slug: "aicandlez",
    name: "AICandlez",
    description:
      "Institutional AI crypto trading SaaS. Autonomous EMA/RSI multi-timeframe engine, paper + live exchange execution, performance-fee on profitable trades only.",
    brand: {
      brandName: "AICandlez",
      tagline: "Institutional AI crypto trading, automated.",
      positioning:
        "Premium, restrained, institutional-grade autonomous trading for serious crypto investors — not an arcade, not a casino.",
      targetAudience:
        "Crypto-native investors and operators who want disciplined, rules-based automated execution with transparent fees.",
      voice: "Authoritative, precise, calm. Speaks like a trading desk, not a hype channel.",
      tone: "Institutional, confident, measured",
      palette: [
        { name: "Brand", hex: "#66FF66" },
        { name: "Emerald", hex: "#00C853" },
        { name: "Lime", hex: "#7CFF00" },
        { name: "Vivid", hex: "#39FF14" },
        { name: "Ink", hex: "#050A07" },
      ],
      valueProps: [
        "Autonomous multi-timeframe AI execution",
        "Performance fee on profitable trades only — never on losses",
        "Live exchange or paper, your call, with hard risk gates",
        "Withdrawal permissions never requested",
      ],
      keywords: [
        "crypto",
        "trading",
        "AI",
        "automation",
        "institutional",
        "signals",
        "execution",
      ],
      dos: [
        "Lead with discipline, risk control, and transparency",
        "Use precise, institutional language",
        "Always frame fees as on profitable trades only",
      ],
      donts: [
        "No gambling or arcade cues",
        "No guaranteed-returns or get-rich-quick claims",
        "No emojis",
        "Never imply withdrawal access to user funds",
      ],
      notes:
        "Always brand as AICandlez (never apex / apexdigital legacy). Mobile-first PWA is the primary surface.",
    },
  },
  {
    slug: "mixtapepsd",
    name: "MixtapePSD",
    description:
      "Design template marketplace for music artists and creators — mixtape covers, flyers, and promo graphics delivered as editable PSD templates.",
    brand: {
      brandName: "MixtapePSD",
      tagline: "Studio-grade artwork templates for artists.",
      positioning:
        "The fast lane from idea to release-ready cover art — professional, editable PSD templates for independent music artists and promoters.",
      targetAudience:
        "Independent musicians, DJs, producers, and promoters who need polished cover art and promo graphics fast.",
      voice: "Creative, energetic, street-credible but professional.",
      tone: "Bold, vibrant, culturally fluent",
      palette: [
        { name: "Ink", hex: "#0B0B0F" },
        { name: "Gold", hex: "#E8B339" },
        { name: "Magenta", hex: "#FF2D78" },
        { name: "Cyan", hex: "#22D3EE" },
      ],
      valueProps: [
        "Release-ready PSD templates in minutes",
        "Fully editable, layered, print + digital ready",
        "Designed for music culture, by designers who get it",
      ],
      keywords: [
        "templates",
        "PSD",
        "mixtape",
        "cover art",
        "design",
        "music",
        "artists",
      ],
      dos: [
        "Celebrate the artist and the culture",
        "Show, don't tell — lead with visual proof",
        "Keep it aspirational and creator-first",
      ],
      donts: [
        "No corporate stiffness",
        "No disrespect to the music community",
        "No misleading licensing claims",
      ],
      notes: "Editable starting profile — refine voice and palette per current catalog.",
    },
  },
  {
    slug: "natura-ai",
    name: "Natura AI",
    description:
      "AI wellness companion app — personalized guidance for mindful, balanced living.",
    brand: {
      brandName: "Natura AI",
      tagline: "Your calm, intelligent wellness companion.",
      positioning:
        "A gentle, science-aware AI wellness companion that helps people build sustainable, mindful routines.",
      targetAudience:
        "Wellness-minded individuals seeking calm, personalized, non-judgmental guidance.",
      voice: "Warm, supportive, grounded. Encouraging without pressure.",
      tone: "Calm, nurturing, reassuring",
      palette: [
        { name: "Sage", hex: "#7BA98C" },
        { name: "Sand", hex: "#E7DCC8" },
        { name: "Clay", hex: "#C08457" },
        { name: "Deep Forest", hex: "#243B2E" },
      ],
      valueProps: [
        "Personalized, adaptive wellness guidance",
        "Mindful routines that actually stick",
        "Private, gentle, judgment-free",
      ],
      keywords: ["wellness", "mindfulness", "AI", "health", "calm", "routines"],
      dos: [
        "Be gentle and encouraging",
        "Respect privacy and autonomy",
        "Use natural, calming imagery",
      ],
      donts: [
        "No medical claims or diagnoses",
        "No guilt or pressure framing",
        "No alarmist language",
      ],
      notes: "Editable starting profile for the wellness line.",
    },
  },
  {
    slug: "natura-yoga",
    name: "Natura Yoga",
    description:
      "Yoga and movement studio brand — classes, programs, and a mindful community for all levels.",
    brand: {
      brandName: "Natura Yoga",
      tagline: "Move mindfully. Live fully.",
      positioning:
        "An inclusive, all-levels yoga and movement practice rooted in nature and mindful community.",
      targetAudience:
        "People of all experience levels seeking mindful movement, balance, and community.",
      voice: "Welcoming, serene, inclusive. Invites rather than instructs.",
      tone: "Serene, grounded, inclusive",
      palette: [
        { name: "Olive", hex: "#6B7A4F" },
        { name: "Linen", hex: "#F2EBDD" },
        { name: "Terracotta", hex: "#B5663F" },
        { name: "Slate", hex: "#33403A" },
      ],
      valueProps: [
        "All-levels, judgment-free practice",
        "Mindful movement rooted in nature",
        "A real, welcoming community",
      ],
      keywords: ["yoga", "movement", "mindfulness", "studio", "community", "wellness"],
      dos: [
        "Be inclusive and welcoming to beginners",
        "Center breath, balance, and community",
        "Use natural, warm imagery",
      ],
      donts: [
        "No body-shaming or elitism",
        "No intimidating jargon",
        "No medical claims",
      ],
      notes: "Editable starting profile for the studio brand.",
    },
  },
];

interface AgentSeed {
  name: string;
  agentType: string;
  role: string;
  description: string;
  capabilities: string[];
}

const AGENT_SEEDS: AgentSeed[] = [
  {
    name: "Prometheus",
    agentType: "prometheus",
    role: "Marketing Strategist",
    description:
      "Advisory marketing-strategy agent. Drafts campaigns, content calendars, ad concepts, creative briefs, social schedules, funnels, and launch plans grounded on brand + memory. Never publishes or auto-posts.",
    capabilities: [
      "campaign_strategy",
      "content_calendar",
      "ad_concepts",
      "creative_briefs",
      "social_schedule",
      "funnel_plan",
      "launch_plan",
    ],
  },
  {
    name: "Vision",
    agentType: "vision",
    role: "Creative Director (Images) — reserved",
    description:
      "Reserved (Phase 2). Will draft image concepts and generate visuals via programmatic media generation. Advisory-only; disabled until built.",
    capabilities: ["image_concept", "image_generation"],
  },
  {
    name: "Phoenix",
    agentType: "phoenix",
    role: "Motion Director (Video) — reserved",
    description:
      "Reserved (Phase 3). Will draft video concepts and produce short animated video. Advisory-only; disabled until built.",
    capabilities: ["video_concept", "video_generation"],
  },
];

const COGNITION_BUDGET_NAME = "Creative cognition budget";
// Cost ceiling in USD-micros per rolling window (interpreted by checkCognitionBudget).
const COGNITION_BUDGET_MICROS = 20_000_000; // $20
const COGNITION_BUDGET_WINDOW_SECONDS = 30 * 24 * 3600; // 30 days

export interface CreativeSeedResult {
  businesses: number;
  brandProfiles: number;
  agents: number;
  budgetCreated: boolean;
}

export async function seedCreativeDivision(
  createdBy: string | null = SEED_CREATED_BY,
): Promise<CreativeSeedResult> {
  let businesses = 0;
  let brandProfiles = 0;
  let agents = 0;

  for (const seed of BUSINESS_SEEDS) {
    const [business] = await db
      .insert(jarvisBusinessesTable)
      .values({
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
      })
      .onConflictDoUpdate({
        target: jarvisBusinessesTable.slug,
        set: { name: seed.name, updatedAt: new Date() },
      })
      .returning();
    if (!business) continue;
    businesses += 1;

    // Mirror into executive memory so it is retrievable/citable for grounding.
    try {
      await recordBusinessMemory(business, createdBy);
    } catch {
      // Memory mirror is best-effort; never break the seed.
    }

    await db
      .insert(jarvisBrandProfilesTable)
      .values({
        ...seed.brand,
        businessId: business.id,
        createdBy: createdBy ?? SEED_CREATED_BY,
      })
      .onConflictDoUpdate({
        target: jarvisBrandProfilesTable.businessId,
        set: { ...seed.brand, updatedAt: new Date() },
      });
    brandProfiles += 1;
  }

  for (const seed of AGENT_SEEDS) {
    const existing = await db
      .select({ id: jarvisAgentsTable.id })
      .from(jarvisAgentsTable)
      .where(eq(jarvisAgentsTable.name, seed.name))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(jarvisAgentsTable)
        .set({
          agentType: seed.agentType,
          role: seed.role,
          description: seed.description,
          capabilities: seed.capabilities,
          updatedAt: new Date(),
        })
        .where(eq(jarvisAgentsTable.id, existing[0]!.id));
    } else {
      await db.insert(jarvisAgentsTable).values({
        name: seed.name,
        agentType: seed.agentType,
        role: seed.role,
        description: seed.description,
        capabilities: seed.capabilities,
        // Advisory agents: never scheduler-driven. Manual invocation only.
        enabled: false,
        scheduleSeconds: null,
        status: "active",
      });
    }
    agents += 1;
  }

  // Cognition budget — create only if no cognition-scoped budget exists.
  const existingBudget = await db
    .select({ id: jarvisBudgetsTable.id })
    .from(jarvisBudgetsTable)
    .where(eq(jarvisBudgetsTable.scopeType, "cognition"))
    .limit(1);
  let budgetCreated = false;
  if (existingBudget.length === 0) {
    await db.insert(jarvisBudgetsTable).values({
      name: COGNITION_BUDGET_NAME,
      description: "Shared spend ceiling for cognition + creative LLM synthesis.",
      scopeType: "cognition",
      limitCount: COGNITION_BUDGET_MICROS,
      windowSeconds: COGNITION_BUDGET_WINDOW_SECONDS,
      enabled: true,
      createdBy: createdBy ?? SEED_CREATED_BY,
    });
    budgetCreated = true;
  }

  return { businesses, brandProfiles, agents, budgetCreated };
}
