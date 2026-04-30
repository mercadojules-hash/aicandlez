import { useState } from "react";

const FALLBACK_GRADIENTS: Record<string, { bg: string; emoji: string }> = {
  tea:       { bg: "linear-gradient(135deg, #3A2A1A, #5C3D22)", emoji: "🍵" },
  drinks:    { bg: "linear-gradient(135deg, #3A2A1A, #5C3D22)", emoji: "🍵" },
  herbs:     { bg: "linear-gradient(135deg, #1A3524, #2A5038)", emoji: "🌿" },
  plants:    { bg: "linear-gradient(135deg, #1A3524, #2A5038)", emoji: "🌿" },
  stress:    { bg: "linear-gradient(135deg, #2A1A3A, #3D2250)", emoji: "🌿" },
  sleep:     { bg: "linear-gradient(135deg, #1A1A3A, #22225C)", emoji: "🌙" },
  immunity:  { bg: "linear-gradient(135deg, #2A3A1A, #3D5022)", emoji: "💛" },
  energy:    { bg: "linear-gradient(135deg, #3A2A10, #5C4418)", emoji: "⚡" },
  digestion: { bg: "linear-gradient(135deg, #3A1A1A, #5C2222)", emoji: "🫚" },
  bowl:      { bg: "linear-gradient(135deg, #3A2A10, #5C4418)", emoji: "🥣" },
  meals:     { bg: "linear-gradient(135deg, #3A2A10, #5C4418)", emoji: "🥗" },
  soups:     { bg: "linear-gradient(135deg, #3A1A10, #5C2A18)", emoji: "🍲" },
  breakfast: { bg: "linear-gradient(135deg, #3A3010, #5C4C18)", emoji: "🌅" },
  default:   { bg: "linear-gradient(135deg, #1A3524, #2A5038)", emoji: "🌿" },
};

function getFallback(hint: string = "default"): { bg: string; emoji: string } {
  const key = hint.toLowerCase();
  return (
    FALLBACK_GRADIENTS[key] ||
    Object.entries(FALLBACK_GRADIENTS).find(([k]) => key.includes(k))?.[1] ||
    FALLBACK_GRADIENTS.default
  );
}

interface CardImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackHint?: string;
}

export function CardImage({ src, alt, className, style, fallbackHint }: CardImageProps) {
  const [failed, setFailed] = useState(false);
  const fallback = getFallback(fallbackHint);

  if (!src || failed) {
    return (
      <div
        className={className}
        style={{ ...style, background: fallback.bg, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <span style={{ fontSize: 44, lineHeight: 1 }}>{fallback.emoji}</span>
      </div>
    );
  }

  return (
    <div className={className} style={{ ...style, overflow: "hidden", position: "relative" }}>
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}
