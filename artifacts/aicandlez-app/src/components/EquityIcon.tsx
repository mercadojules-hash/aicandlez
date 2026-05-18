// Equity icons — branded monogram badges for major US equities.
// Uses each company's well-known brand color in an SVG monogram (not raw logos
// to avoid copyrighted artwork). Square format with subtle gradient + glow.

import { type ReactElement } from "react";

interface EquityIconProps {
  size?: number;
  bg:    string;          // base brand color
  fg?:   string;          // monogram text color (default white)
  text:  string;          // 1-3 letters
}

function MonogramIcon({ size = 44, bg, fg = "#FFFFFF", text }: EquityIconProps): ReactElement {
  const id = `eq-${text}-${bg.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-label={text}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor={bg} stopOpacity="1"/>
          <stop offset="100%" stopColor={bg} stopOpacity="0.78"/>
        </linearGradient>
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2"/>
        </filter>
      </defs>
      <rect x="1" y="1" width="42" height="42" rx="11"
        fill={`url(#${id})`}
        stroke="rgba(255,255,255,0.10)" strokeWidth="1"/>
      <text x="22" y="28" textAnchor="middle"
        fontFamily="'SF Pro Display','Inter',system-ui,sans-serif"
        fontWeight="800" fontSize={text.length > 2 ? 12 : 16}
        fill={fg}
        letterSpacing={text.length > 2 ? "0.5" : "0"}>
        {text}
      </text>
    </svg>
  );
}

export const TSLAIcon = ({ size = 44 }: { size?: number }) =>
  <MonogramIcon size={size} bg="#CC0000" text="T"/>;

export const NVDAIcon = ({ size = 44 }: { size?: number }) =>
  <MonogramIcon size={size} bg="#76B900" text="N"/>;

export const AAPLIcon = ({ size = 44 }: { size?: number }) =>
  <MonogramIcon size={size} bg="#A3AAAE" fg="#0B0B0B" text="A"/>;

export const METAIcon = ({ size = 44 }: { size?: number }) =>
  <MonogramIcon size={size} bg="#1877F2" text="M"/>;

export const AMZNIcon = ({ size = 44 }: { size?: number }) =>
  <MonogramIcon size={size} bg="#FF9900" fg="#0B0B0B" text="a"/>;

export const MSFTIcon = ({ size = 44 }: { size?: number }) =>
  <MonogramIcon size={size} bg="#0078D4" text="MS"/>;

const REGISTRY: Record<string, (p: { size?: number }) => ReactElement> = {
  TSLA: TSLAIcon, NVDA: NVDAIcon, AAPL: AAPLIcon,
  META: METAIcon, AMZN: AMZNIcon, MSFT: MSFTIcon,
};

export const EQUITY_NAME: Record<string, string> = {
  TSLA: "Tesla, Inc.",
  NVDA: "NVIDIA Corp.",
  AAPL: "Apple Inc.",
  META: "Meta Platforms",
  AMZN: "Amazon.com",
  MSFT: "Microsoft Corp.",
};

export function EquityIcon({ sym, size = 44 }: { sym: string; size?: number }) {
  const Cmp = REGISTRY[sym.toUpperCase()];
  if (Cmp) return <Cmp size={size}/>;
  // Generic fallback — neutral slate badge with first letter
  return <MonogramIcon size={size} bg="#3A4A5A" text={sym.slice(0,1).toUpperCase()}/>;
}

export const SUPPORTED_EQUITIES = ["TSLA","NVDA","AAPL","META","AMZN","MSFT"] as const;
