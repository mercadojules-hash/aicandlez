import { useState } from "react";
import { type LucideIcon, Clock, ChevronLeft, Leaf, Moon, Zap, Heart, Brain, Shield, CheckCircle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { getBackgroundStyle, BG } from "@/lib/background";
import imgStress  from "@assets/natura-plan-stress-relief-v1_1777543715688.webp";
import imgSleep   from "@assets/natura-plan-sleep-reset-v1_1777543715688.webp";
import imgEnergy  from "@assets/natura-plan-energy-boost-v1_1777543715687.webp";
import imgGinger  from "@assets/remedy-ginger-tea_1777546217699.webp";
import imgSmoothie from "@assets/remedy-green-energy-smoothie_1777546217700.webp";

interface Article {
  id: string;
  title: string;
  category: string;
  readTime: string;
  summary: string;
  icon: LucideIcon;
  color: string;
  image: string;
  body: string[];
  keyTakeaways: string[];
}

const ARTICLES: Article[] = [
  {
    id: "breathwork",
    title: "5 Natural Ways to Reduce Stress",
    category: "Stress",
    readTime: "3 min",
    summary: "How conscious breathing and adaptogens shift your body from fight-or-flight to calm.",
    icon: Zap,
    color: "#F5A623",
    image: imgStress,
    body: [
      "Breathing is the only autonomic function you can consciously control — making it a unique bridge between your voluntary and involuntary nervous systems. By changing your breathing pattern, you can directly influence heart rate, blood pressure, and stress hormones.",
      "The 4-7-8 technique (inhale 4 counts, hold 7, exhale 8) and box breathing (4 counts each) both activate the parasympathetic nervous system — your body's 'rest and digest' mode.",
      "Adaptogens like ashwagandha, rhodiola, and holy basil have centuries of traditional use and growing modern evidence for supporting the HPA axis — the system that regulates your cortisol response. Magnesium glycinate, in particular, is widely depleted in modern diets and directly involved in nervous system regulation.",
    ],
    keyTakeaways: [
      "Extended exhales activate the vagal brake — aim for exhale 2× longer than inhale",
      "Ashwagandha shows significant cortisol reduction in clinical trials",
      "Even 5 minutes of box breathing creates measurable HRV improvement",
    ],
  },
  {
    id: "sleep-hygiene",
    title: "Why Your Sleep Is Broken",
    category: "Sleep",
    readTime: "4 min",
    summary: "Practical, evidence-informed strategies to improve your sleep quality tonight.",
    icon: Moon,
    color: "#8B7FD4",
    image: imgSleep,
    body: [
      "Sleep hygiene refers to a set of behavioural and environmental practices that promote consistent, high-quality sleep. Unlike medication, good sleep hygiene addresses the root causes of poor sleep.",
      "Your body has a natural circadian rhythm — a roughly 24-hour internal clock that regulates sleepiness and wakefulness. Disrupting this through inconsistent sleep times, blue light exposure, or late meals can significantly impair sleep quality.",
      "Research shows that lowering your bedroom temperature to around 18°C (65°F), eliminating blue light 2 hours before bed, and keeping a consistent wake time — even on weekends — are among the highest-impact changes you can make.",
    ],
    keyTakeaways: [
      "Consistent wake times matter more than consistent bedtimes",
      "Blue light from screens delays melatonin production by up to 3 hours",
      "Avoid caffeine after 2 PM for most people",
    ],
  },
  {
    id: "energy-morning",
    title: "Morning Habits for Energy",
    category: "Energy",
    readTime: "3 min",
    summary: "The first 60 minutes of your day have an outsized effect on your energy all day long.",
    icon: Zap,
    color: "#9FE870",
    image: imgEnergy,
    body: [
      "The way you start your morning sets your cortisol curve for the day. Morning sunlight exposure within 30 minutes of waking triggers cortisol at its natural peak — improving wakefulness and making it easier to sleep later.",
      "Delaying caffeine by 90–120 minutes after waking allows adenosine to clear naturally, giving you more sustained energy compared to immediate caffeine that often causes an earlier afternoon crash.",
      "A protein-rich breakfast — combined with complex carbohydrates — stabilises blood sugar through the morning, preventing the energy dips that follow high-sugar or skipped breakfasts.",
    ],
    keyTakeaways: [
      "Sunlight within 30 min of waking anchors your circadian rhythm",
      "Delay caffeine 90–120 min after waking for longer-lasting effect",
      "10 min of movement in the morning increases BDNF by up to 200%",
    ],
  },
  {
    id: "gut-health",
    title: "Foods That Help Digestion",
    category: "Digestion",
    readTime: "4 min",
    summary: "Understanding the gut-brain axis and why your microbiome matters for mood and energy.",
    icon: Heart,
    color: "#E87D6B",
    image: imgGinger,
    body: [
      "The enteric nervous system — sometimes called the 'second brain' — contains over 100 million nerve cells lining your gastrointestinal tract. It communicates bidirectionally with your brain via the vagus nerve.",
      "Your gut microbiome produces approximately 90% of your body's serotonin. A diverse plant-rich diet, fermented foods (kefir, kimchi, miso), and prebiotic fibre (oats, garlic, Jerusalem artichokes) are the most evidence-backed ways to support microbiome diversity.",
      "Ginger is one of the most well-studied digestive aids — it accelerates gastric emptying, reduces nausea, and has direct anti-inflammatory effects on the gut lining. Warm water with fresh ginger and lemon is a simple, evidence-supported morning ritual.",
    ],
    keyTakeaways: [
      "Aim for 30+ different plant foods per week for microbiome diversity",
      "Chronic stress directly damages gut lining integrity (leaky gut)",
      "Fermented foods improve microbiome diversity more than supplements",
    ],
  },
  {
    id: "anti-inflammatory",
    title: "How to Strengthen Your Immune System",
    category: "Immunity",
    readTime: "3 min",
    summary: "Foods and habits that science links to reduced inflammation and stronger immunity.",
    icon: Shield,
    color: "#4CAF7D",
    image: imgSmoothie,
    body: [
      "Chronic low-grade inflammation is associated with conditions ranging from cardiovascular disease to depression. Dietary choices are one of the most powerful tools for modulating inflammation at the cellular level.",
      "The Mediterranean diet — rich in olive oil, fatty fish, colourful vegetables, legumes, and whole grains — consistently shows the strongest anti-inflammatory evidence in large population studies.",
      "Key anti-inflammatory compounds: omega-3 fatty acids (oily fish, flaxseed, walnuts), polyphenols (berries, dark chocolate, green tea), and curcumin (turmeric) — particularly when combined with black pepper to enhance absorption by 2000%.",
    ],
    keyTakeaways: [
      "Ultra-processed foods are among the most pro-inflammatory to limit",
      "Turmeric bioavailability increases 2000% with black pepper (piperine)",
      "Vitamin D deficiency is linked to impaired immune response",
    ],
  },
  {
    id: "adaptogens",
    title: "What Are Adaptogens?",
    category: "Herbs",
    readTime: "3 min",
    summary: "How adaptogenic herbs help your body handle stress and build long-term resilience.",
    icon: Leaf,
    color: "#4ead7c",
    image: imgStress,
    body: [
      "Adaptogens are a class of herbs and mushrooms used in traditional medicine for centuries. They are defined by their ability to help the body 'adapt' to physical, chemical, and biological stressors.",
      "Unlike stimulants, adaptogens work in a non-specific way — they support your body's overall resilience rather than targeting one specific system. Popular examples include ashwagandha, rhodiola, and eleuthero.",
      "Research suggests adaptogens may support the HPA axis — the system that regulates your stress response. By modulating cortisol and other stress hormones, they may help you feel calmer under pressure while maintaining energy and focus.",
    ],
    keyTakeaways: [
      "Adaptogens work best when taken consistently over 4–8 weeks",
      "Not all adaptogens are the same — each has a distinct profile",
      "Consult a healthcare provider before starting any new supplement",
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
    image: imgSleep,
    body: [
      "Psychoneuroimmunology (PNI) studies the interaction between psychological processes and the nervous and immune systems. Research confirms that thoughts and emotions create measurable physical changes in the body.",
      "Chronic negative thought patterns activate the sympathetic nervous system, elevating cortisol, suppressing immune function, and accelerating cellular aging. Positive emotions are associated with lower inflammation and better immune response.",
      "Mindfulness meditation, journaling, and social connection produce epigenetic changes — altering which genes are expressed — demonstrating that lifestyle choices reach all the way to the cellular level.",
    ],
    keyTakeaways: [
      "8 weeks of mindfulness training measurably changes brain structure",
      "Social connection is as protective as exercise for longevity",
      "The placebo effect is real and measurable — belief matters",
    ],
  },
];

const CATEGORIES = ["All", "Stress", "Sleep", "Energy", "Digestion", "Immunity", "Herbs", "Mindfulness"];

const QUICK_TIPS = [
  { emoji: "🍋", text: "Drink warm lemon water" },
  { emoji: "☀️", text: "Step outside for sunlight" },
  { emoji: "🌬️", text: "Take 3 deep breaths" },
  { emoji: "🚶", text: "Walk for 10 minutes" },
  { emoji: "💧", text: "Hydrate before coffee" },
];

function ArticleDetail({ article, onClose }: { article: Article; onClose: () => void }) {
  const Icon = article.icon;
  return (
    <div className="learn-detail">
      {/* Hero */}
      <div className="learn-detail-hero">
        <img src={article.image} alt={article.title} className="learn-detail-img" />
        <div className="learn-detail-overlay">
          <div className="learn-detail-top">
            <button className="detail-back-btn" onClick={onClose}>
              <ChevronLeft size={22} color="#fff" />
            </button>
          </div>
          <div className="learn-detail-bottom">
            <span className="detail-hero-category" style={{ color: article.color, borderColor: article.color + "66", background: article.color + "22" }}>
              {article.category}
            </span>
            <h1 className="detail-hero-title">{article.title}</h1>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="detail-content">
        <div className="detail-meta">
          <span className="detail-prep"><Clock size={13} style={{ display: "inline", marginRight: 4 }} />{article.readTime} read</span>
        </div>
        <p className="detail-description">{article.summary}</p>
        {article.body.map((para, i) => (
          <p key={i} className="learn-detail-para">{para}</p>
        ))}
        <div className="learn-detail-takeaways">
          <p className="learn-takeaway-title">Key Takeaways</p>
          {article.keyTakeaways.map((t, i) => (
            <div key={i} className="benefit-row">
              <span className="benefit-check"><CheckCircle size={13} color={article.color} /></span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Learn() {
  const [filter, setFilter]     = useState("All");
  const [selected, setSelected] = useState<Article | null>(null);

  const filtered = filter === "All" ? ARTICLES : ARTICLES.filter((a) => a.category === filter);
  const featured = filtered[0];
  const rest      = filtered.slice(1);

  if (selected) {
    return (
      <Layout bgStyle={getBackgroundStyle(BG.calm)}>
        <ArticleDetail article={selected} onClose={() => setSelected(null)} />
      </Layout>
    );
  }

  return (
    <Layout bgStyle={getBackgroundStyle(BG.calm)}>
      <div className="scroll-view">
        {/* Header */}
        <div className="learn-header">
          <h1 className="learn-page-title">Learn & Improve</h1>
          <p className="learn-page-sub">Simple wellness insights for your daily life</p>
        </div>

        {/* Quick Tips */}
        <div className="learn-section-label">Quick Tips Today</div>
        <div className="quick-tips-scroll">
          {QUICK_TIPS.map((tip, i) => (
            <div key={i} className="quick-tip-card">
              <span className="quick-tip-emoji">{tip.emoji}</span>
              <span className="quick-tip-text">{tip.text}</span>
            </div>
          ))}
        </div>

        {/* Category Filter */}
        <div className="filter-scroll" style={{ margin: "8px 0 0", padding: "0 16px 14px" }}>
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

        {/* Articles */}
        <div className="learn-section-label">Articles</div>
        <div className="learn-list">
          {/* Featured card */}
          {featured && (
            <button
              className="learn-featured-card"
              onClick={() => setSelected(featured)}
            >
              <img src={featured.image} alt={featured.title} className="learn-featured-img" loading="lazy" />
              <div className="learn-featured-overlay">
                <div className="learn-featured-meta">
                  <span className="learn-cat-pill" style={{ color: featured.color, background: featured.color + "22", borderColor: featured.color + "55" }}>
                    {featured.category}
                  </span>
                  <span className="learn-read-time-pill"><Clock size={11} style={{ display: "inline", marginRight: 3 }} />{featured.readTime}</span>
                </div>
                <p className="learn-featured-title">{featured.title}</p>
                <p className="learn-featured-summary">{featured.summary}</p>
              </div>
            </button>
          )}

          {/* Rest of articles */}
          {rest.map((article) => {
            const Icon = article.icon;
            return (
              <button
                key={article.id}
                className="learn-article-card"
                onClick={() => setSelected(article)}
              >
                <div className="learn-article-img-wrap">
                  <img src={article.image} alt={article.title} className="learn-article-img" loading="lazy" />
                  <div className="learn-article-img-overlay" />
                </div>
                <div className="learn-article-body">
                  <div className="learn-article-meta">
                    <span className="learn-cat-pill" style={{ color: article.color, background: article.color + "22", borderColor: article.color + "55" }}>
                      {article.category}
                    </span>
                    <span className="learn-read-time-pill"><Clock size={10} style={{ display: "inline", marginRight: 3 }} />{article.readTime}</span>
                  </div>
                  <p className="learn-article-title">{article.title}</p>
                  <p className="learn-article-summary">{article.summary}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ height: 28 }} />
      </div>
    </Layout>
  );
}
