import type { CSSProperties } from "react";

export const BG = {
  main1:     "https://apexdigital.design/wp-content/uploads/2026/04/natura-bg-main-v1.webp",
  main2:     "https://apexdigital.design/wp-content/uploads/2026/04/natura-bg-main-v2.webp",
  meditation:"https://apexdigital.design/wp-content/uploads/2026/04/natura-bg-meditation-v1.webp",
  focus:     "https://apexdigital.design/wp-content/uploads/2026/04/natura-bg-focus-v1.webp",
} as const;

export function getBackgroundStyle(bgUrl: string): CSSProperties {
  return {
    backgroundImage: `
      radial-gradient(circle at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 70%),
      linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.50) 100%),
      linear-gradient(to top right, rgba(80,255,150,0.08), transparent),
      url(${bgUrl})
    `,
    backgroundSize: "cover",
    backgroundPosition: "center right",
    backgroundRepeat: "no-repeat",
  };
}
