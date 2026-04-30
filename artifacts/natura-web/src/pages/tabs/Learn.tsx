import { useState } from "react";
import { type LucideIcon, Clock, ChevronDown, ChevronUp, Leaf, Moon, Zap, Heart, Brain, Shield } from "lucide-react";
import { Layout } from "@/components/Layout";

interface Article {
  id: string;
  title: string;
  category: string;
  readTime: string;
  summary: string;
  icon: LucideIcon;
  color: string;
  body: string[];
  keyTakeaways: string[];
}

const ARTICLES: Article[] = [
  {
    id: "adaptogens",
    title: "What Are Adaptogens?",
    category: "Herbs",
    readTime: "3 min",
    summary: "Learn how adaptogenic herbs help your body handle stress more effectively.",
    icon: Leaf,
    color: "#4ead7c",
    body: [
      "Adaptogens are a class of herbs and mushrooms that have been used in traditional medicine for centuries. They are defined by their ability to help the body 'adapt' to physical, chemical, and biological stressors.",
      "Unlike stimulants, adaptogens work in a non-specific way — they support your body's overall resilience rather than targeting one specific system. Popular examples include ashwagandha, rhodiola, and eleuthero.",
      "Research suggests adaptogens may support the hypothalamic-pituitary-adrenal (HPA) axis — the system that regulates your stress response. By modulating cortisol and other stress hormones, they may help you feel calmer under pressure.",
    ],
    keyTakeaways: [
      "Adaptogens work best when taken consistently over weeks",
      "Not all adaptogens are the same — each has a distinct profile",
      "Always consult a healthcare provider before starting a new supplement",
    ],
  },
  {
    id: "sleep-hygiene",
    title: "The Science of Sleep Hygiene",
    category: "Sleep",
    readTime: "4 min",
    summary: "Practical, evidence-informed strategies to improve your sleep quality tonight.",
    icon: Moon,
    color: "#8B7FD4",
    body: [
      "Sleep hygiene refers to a set of behavioural and environmental practices that promote consistent, high-quality sleep. Unlike medication, good sleep hygiene addresses the root causes of poor sleep.",
      "Your body has a natural circadian rhythm — a roughly 24-hour internal clock that regulates sleepiness and wakefulness. Disrupting this clock through inconsistent sleep times, blue light exposure, or late meals can significantly impair sleep quality.",
      "Research shows that lowering your bedroom temperature to around 18°C (65°F), eliminating blue light 2 hours before bed, and keeping a consistent wake time — even on weekends — are among the highest-impact changes you can make.",
    ],
    keyTakeaways: [
      "Consistent wake times matter more than consistent bedtimes",
      "Blue light from screens delays melatonin production by up to 3 hours",
      "Avoid caffeine after 2 PM for most people",
    ],
  },
  {
    id: "gut-health",
    title: "Your Gut: The Second Brain",
    category: "Digestion",
    readTime: "4 min",
    summary: "Understanding the gut-brain axis and why your microbiome matters for mood and energy.",
    icon: Heart,
    color: "#E87D6B",
    body: [
      "The enteric nervous system — sometimes called the 'second brain' — contains over 100 million nerve cells lining your gastrointestinal tract. It can operate independently of your brain and communicates bidirectionally via the vagus nerve.",
      "Your gut microbiome, a community of trillions of bacteria and other microbes, produces approximately 90% of your body's serotonin. This is why gut health has a profound impact on mood, anxiety, and cognitive function.",
      "A diverse plant-rich diet, regular fermented foods (like kefir, kimchi, and miso), and prebiotic fibre (like oats, garlic, and Jerusalem artichokes) are among the most evidence-backed ways to support microbiome diversity.",
    ],
    keyTakeaways: [
      "Aim for 30+ different plant foods per week for microbiome diversity",
      "Antibiotics significantly disrupt microbiome balance — use probiotics to recover",
      "Chronic stress directly damages gut lining integrity",
    ],
  },
  {
    id: "breathwork",
    title: "Breathwork & the Nervous System",
    category: "Stress",
    readTime: "3 min",
    summary: "How conscious breathing techniques can shift your body from fight-or-flight to rest-and-digest.",
    icon: Zap,
    color: "#F5A623",
    body: [
      "Breathing is the only autonomic function you can consciously control — making it a unique bridge between your voluntary and involuntary nervous systems. By changing your breathing pattern, you can directly influence heart rate, blood pressure, and stress hormones.",
      "The 4-7-8 technique (inhale 4 counts, hold 7, exhale 8) and box breathing (4 counts each: inhale, hold, exhale, hold) are both shown to activate the parasympathetic nervous system — your body's 'rest and digest' mode.",
      "Even physiological sighs — a double inhale through the nose followed by a long exhale through the mouth — are documented to reduce stress in real time. Stanford researchers found just one or two sighs per minute can rapidly calm the nervous system.",
    ],
    keyTakeaways: [
      "Extended exhales are the key to activating the vagal brake",
      "Nasal breathing is significantly more calming than mouth breathing",
      "5–10 minutes of daily breathwork shows cumulative benefits over weeks",
    ],
  },
  {
    id: "anti-inflammatory",
    title: "Anti-Inflammatory Foods",
    category: "Nutrition",
    readTime: "3 min",
    summary: "Foods that science links to reduced systemic inflammation — the root of many chronic conditions.",
    icon: Shield,
    color: "#4CAF7D",
    body: [
      "Chronic low-grade inflammation is associated with conditions ranging from cardiovascular disease and type 2 diabetes to depression and autoimmune disorders. Dietary choices are one of the most powerful tools for modulating inflammation.",
      "The Mediterranean diet — rich in olive oil, fatty fish, colourful vegetables, legumes, and whole grains — consistently shows the strongest anti-inflammatory evidence in large population studies.",
      "Key anti-inflammatory compounds include omega-3 fatty acids (oily fish, flaxseed, walnuts), polyphenols (berries, dark chocolate, green tea), and curcumin (turmeric), particularly when combined with black pepper to enhance absorption.",
    ],
    keyTakeaways: [
      "Ultra-processed foods are among the most pro-inflammatory foods to limit",
      "Turmeric bioavailability increases 2000% with black pepper",
      "Olive oil's oleocanthal has similar anti-inflammatory activity to ibuprofen",
    ],
  },
  {
    id: "mind-body",
    title: "Mind-Body Connection Explained",
    category: "Mindfulness",
    readTime: "3 min",
    summary: "The science behind how thoughts, emotions, and beliefs physically alter your body.",
    icon: Brain,
    color: "#9B59B6",
    body: [
      "Psychoneuroimmunology (PNI) is the study of the interaction between psychological processes and the nervous and immune systems. Research in this field has confirmed that thoughts and emotions create measurable physical changes in the body.",
      "Chronic negative thought patterns activate the sympathetic nervous system, elevating cortisol, suppressing immune function, and accelerating cellular aging. Positive emotions, conversely, are associated with lower inflammation and better immune response.",
      "Practices like mindfulness meditation, journaling, and even social connection have been shown to produce epigenetic changes — altering which genes are expressed — demonstrating that lifestyle choices reach all the way to the cellular level.",
    ],
    keyTakeaways: [
      "8 weeks of mindfulness training measurably changes brain structure",
      "Social connection is as protective as exercise for longevity",
      "The placebo effect is real and measurable — belief matters",
    ],
  },
];

const CATEGORIES = ["All", "Herbs", "Sleep", "Digestion", "Stress", "Nutrition", "Mindfulness"];

export default function Learn() {
  const [filter, setFilter] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = filter === "All" ? ARTICLES : ARTICLES.filter((a) => a.category === filter);

  return (
    <Layout>
      <div className="scroll-view">
        <div className="page-header">
          <h1 className="page-title">Learn</h1>
          <p className="section-label" style={{ padding: 0, marginBottom: 0 }}>
            Evidence-informed wellness education
          </p>
        </div>

        <div className="filter-scroll" style={{ margin: "12px 0 0", padding: "0 20px 12px" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`filter-chip ${filter === cat ? "active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((article) => {
            const isOpen = expanded === article.id;
            const Icon = article.icon;
            return (
              <div
                key={article.id}
                className="learn-card"
                onClick={() => setExpanded(isOpen ? null : article.id)}
              >
                <div className="learn-card-header">
                  <div className="learn-icon-wrap" style={{ background: article.color + "22" }}>
                    <Icon size={18} color={article.color} strokeWidth={2} />
                  </div>
                  <div className="learn-card-meta">
                    <div className="learn-card-top">
                      <span className="learn-category" style={{ color: article.color }}>{article.category}</span>
                      <span className="learn-read-time">
                        <Clock size={11} style={{ display: "inline", marginRight: 3 }} />
                        {article.readTime}
                      </span>
                    </div>
                    <p className="learn-title">{article.title}</p>
                    {!isOpen && <p className="learn-summary">{article.summary}</p>}
                  </div>
                  <div className="learn-toggle">
                    {isOpen
                      ? <ChevronUp size={16} color="var(--muted-fg)" />
                      : <ChevronDown size={16} color="var(--muted-fg)" />}
                  </div>
                </div>

                {isOpen && (
                  <div className="learn-body">
                    {article.body.map((para, i) => (
                      <p key={i} className="learn-para">{para}</p>
                    ))}
                    <div className="learn-takeaways">
                      <p className="learn-takeaway-title">Key Takeaways</p>
                      {article.keyTakeaways.map((t, i) => (
                        <div key={i} className="learn-takeaway-row">
                          <div className="learn-takeaway-dot" />
                          <p className="learn-takeaway-text">{t}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
