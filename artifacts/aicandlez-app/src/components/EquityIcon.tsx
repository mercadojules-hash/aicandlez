// ═══════════════════════════════════════════════════════════════════════════
// Real equity brand marks — inline SVG of each company's iconic mark
// (Apple bitten-apple, Microsoft 4-square, NVIDIA eye, Tesla T, Meta
// infinity loop, Amazon smile, Google G, AMD arrow, Intel "i", Salesforce
// cloud). Each mark sits on a premium rounded-square chip in the company's
// brand color for instant visual recognition. Used across Equities,
// Signals, Portfolio, Active Trades, and Trade History.
// ═══════════════════════════════════════════════════════════════════════════

import { type ReactElement } from "react";

interface ChipProps {
  size:     number;
  bg:       string;
  glow:     string;
  children: ReactElement;
}

function Chip({ size, bg, glow, children }: ChipProps): ReactElement {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.25),
      flexShrink: 0,
      background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 14px ${glow}, inset 0 0 0 1px rgba(255,255,255,0.06)`,
    }}>{children}</div>
  );
}

// ── AAPL — Apple bitten-apple silhouette ──────────────────────────────────
export const AAPLIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #1B1B1F 0%, #0A0A0C 100%)"
    glow="rgba(255,255,255,0.20)">
    <svg width={size*0.56} height={size*0.62} viewBox="0 0 24 26" fill="white">
      <path d="M17.5 13.7c0-2.7 2.2-4 2.3-4-1.2-1.8-3.2-2-3.9-2.1-1.7-.2-3.2.9-4.1.9-.9 0-2.2-.9-3.6-.9-1.9 0-3.6 1.1-4.5 2.7-2 3.4-.5 8.4 1.4 11.2.9 1.3 2 2.9 3.5 2.8 1.4-.1 1.9-.9 3.6-.9 1.6 0 2.1.9 3.6.9 1.5 0 2.4-1.4 3.3-2.7 1-1.5 1.5-3 1.5-3.1-.1 0-2.9-1.1-3-4.4zM14.7 5.5c.8-.9 1.3-2.2 1.1-3.5-1.1.1-2.5.7-3.3 1.7-.7.8-1.4 2.1-1.2 3.4 1.3.1 2.6-.6 3.4-1.6z"/>
    </svg>
  </Chip>
);

// ── MSFT — Microsoft 4-square (red/green/blue/yellow) ────────────────────
export const MSFTIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #1B1B1F 0%, #0A0A0C 100%)"
    glow="rgba(0,164,239,0.30)">
    <svg width={size*0.64} height={size*0.64} viewBox="0 0 22 22" fill="none">
      <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
      <rect x="12" y="1"  width="9" height="9" fill="#7FBA00"/>
      <rect x="1"  y="12" width="9" height="9" fill="#00A4EF"/>
      <rect x="12" y="12" width="9" height="9" fill="#FFB900"/>
    </svg>
  </Chip>
);

// ── NVDA — NVIDIA eye/swoosh ──────────────────────────────────────────────
export const NVDAIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #0A0A0C 0%, #1B1B1F 100%)"
    glow="rgba(118,185,0,0.50)">
    <svg width={size*0.68} height={size*0.62} viewBox="0 0 28 26" fill="#76B900">
      <path d="M10.5 8.5 C8 9 6 11 6 13.5 C6 16 8 18 10.5 18 L10.5 16 C9 16 8 14.8 8 13.5 C8 12 9.2 11 10.5 10.5 L10.5 8.5 Z M14 5 C18.5 5 22 8.5 22 13 C22 17.5 18.5 21 14 21 L14 19 C17.4 19 20 16.4 20 13 C20 9.6 17.4 7 14 7 L14 5 Z M14 9 C14 9 16 10 16 13 C16 16 14 17 14 17 L14 15 C14.7 14.7 14.8 13.5 14.8 13 C14.8 12.5 14.7 11.3 14 11 L14 9 Z" />
    </svg>
  </Chip>
);

// ── TSLA — Tesla T mark ───────────────────────────────────────────────────
export const TSLAIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #1B1B1F 0%, #0A0A0C 100%)"
    glow="rgba(204,0,0,0.50)">
    <svg width={size*0.62} height={size*0.62} viewBox="0 0 28 24" fill="#E31937">
      <path d="M14 8 L14 22 L12.4 22 L12.4 8 L7 8 L6 5.5 C9 4 11.5 3.5 14 3.5 C16.5 3.5 19 4 22 5.5 L21 8 Z M14 2.5 C18 2.5 21.5 3.2 24.5 4.5 L23 7.5 C20.5 6.3 17 5.5 14 5.5 C11 5.5 7.5 6.3 5 7.5 L3.5 4.5 C6.5 3.2 10 2.5 14 2.5 Z"/>
    </svg>
  </Chip>
);

// ── META — Meta infinity loop ─────────────────────────────────────────────
export const METAIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #1B1B1F 0%, #0A0A0C 100%)"
    glow="rgba(0,129,255,0.45)">
    <svg width={size*0.7} height={size*0.5} viewBox="0 0 32 22" fill="none">
      <defs>
        <linearGradient id="meta-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#0081FB"/>
          <stop offset="50%"  stopColor="#A033FF"/>
          <stop offset="100%" stopColor="#FF0066"/>
        </linearGradient>
      </defs>
      <path d="M3 13.5 C3 8 6 4 10 4 C12.5 4 14.5 5.5 16 8 C17.5 5.5 19.5 4 22 4 C26 4 29 8 29 13.5 C29 17 27 19 24.5 19 C22.5 19 21 17.8 19.5 15.5 L17.5 12.5 C16.7 11.3 16.3 10.8 16 10.5 C15.7 10.8 15.3 11.3 14.5 12.5 L12.5 15.5 C11 17.8 9.5 19 7.5 19 C5 19 3 17 3 13.5 Z M7 13.5 C7 15 7.6 16 8.6 16 C9.4 16 10 15.5 11 14 L12.6 11.5 C12 10.6 11 10 10 10 C8.2 10 7 11.5 7 13.5 Z M16.4 11.5 L18 14 C19 15.5 19.6 16 20.4 16 C21.4 16 22 15 22 13.5 C22 11.5 20.8 10 19 10 C18 10 17 10.6 16.4 11.5 Z"
        fill="url(#meta-g)"/>
    </svg>
  </Chip>
);

// ── AMZN — Amazon "smile" arrow under stylized "a" ────────────────────────
export const AMZNIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #232F3E 0%, #131A24 100%)"
    glow="rgba(255,153,0,0.50)">
    <svg width={size*0.7} height={size*0.7} viewBox="0 0 32 32" fill="none">
      <text x="16" y="18" textAnchor="middle"
        fontFamily="'SF Pro Display','Inter',sans-serif"
        fontSize="14" fontWeight="800" fill="#FFFFFF" letterSpacing="-0.5">
        amazon
      </text>
      <path d="M6 22 C11 26 21 26 26 22"
        stroke="#FF9900" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <path d="M24.5 23 L26.5 22 L25.5 24" fill="#FF9900"/>
    </svg>
  </Chip>
);

// ── GOOG / GOOGL — Google G ───────────────────────────────────────────────
export const GOOGIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #FFFFFF 0%, #F1F3F4 100%)"
    glow="rgba(66,133,244,0.30)">
    <svg width={size*0.66} height={size*0.66} viewBox="0 0 24 24" fill="none">
      <path d="M22.5 12.2 C22.5 11.4 22.4 10.7 22.3 10 L12 10 L12 14.2 L17.9 14.2 C17.7 15.6 16.9 16.7 15.7 17.5 L15.7 20 L19 20 C21.2 18.1 22.5 15.4 22.5 12.2 Z" fill="#4285F4"/>
      <path d="M12 23 C14.9 23 17.4 22 19 20.4 L15.7 17.9 C14.8 18.5 13.5 18.9 12 18.9 C9.2 18.9 6.8 17 5.9 14.5 L2.5 14.5 L2.5 17.1 C4.2 20.5 7.8 23 12 23 Z" fill="#34A853"/>
      <path d="M5.9 14.1 C5.7 13.4 5.5 12.7 5.5 12 C5.5 11.3 5.6 10.6 5.9 9.9 L5.9 7.3 L2.5 7.3 C1.7 8.7 1.3 10.3 1.3 12 C1.3 13.7 1.7 15.3 2.5 16.7 L5.9 14.1 Z" fill="#FBBC05"/>
      <path d="M12 5.1 C13.6 5.1 15 5.6 16.1 6.6 L19.1 3.7 C17.4 2 14.9 1 12 1 C7.8 1 4.2 3.5 2.5 6.9 L5.9 9.5 C6.8 7 9.2 5.1 12 5.1 Z" fill="#EA4335"/>
    </svg>
  </Chip>
);

// ── AMD — AMD arrow mark ──────────────────────────────────────────────────
export const AMDIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #1B1B1F 0%, #0A0A0C 100%)"
    glow="rgba(237,28,36,0.50)">
    <svg width={size*0.66} height={size*0.66} viewBox="0 0 30 30" fill="none">
      {/* Stylized AMD arrow inside square */}
      <path d="M5 5 L19 5 L25 11 L25 25 L21 25 L21 13 L9 13 L9 25 L5 25 Z"
        fill="none" stroke="#ED1C24" strokeWidth="2.4" strokeLinejoin="miter"/>
      <text x="15" y="22.5" textAnchor="middle"
        fontFamily="'SF Pro Display','Inter',sans-serif"
        fontSize="6.5" fontWeight="800" fill="#FFFFFF" letterSpacing="0.4">
        AMD
      </text>
    </svg>
  </Chip>
);

// ── INTC — Intel "intel" wordmark ─────────────────────────────────────────
export const INTCIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #FFFFFF 0%, #F0F2F5 100%)"
    glow="rgba(0,113,197,0.45)">
    <svg width={size*0.76} height={size*0.56} viewBox="0 0 32 20" fill="none">
      <text x="16" y="14" textAnchor="middle"
        fontFamily="'SF Pro Display','Inter',sans-serif"
        fontSize="10" fontWeight="700" fill="#0071C5" letterSpacing="-0.3">
        intel
      </text>
      <circle cx="11.5" cy="6.4" r="0.9" fill="#0071C5"/>
    </svg>
  </Chip>
);

// ── CRM — Salesforce cloud ────────────────────────────────────────────────
export const CRMIcon = ({ size = 44 }: { size?: number }) => (
  <Chip size={size} bg="linear-gradient(135deg, #00A1E0 0%, #006FB3 100%)"
    glow="rgba(0,161,224,0.55)">
    <svg width={size*0.72} height={size*0.56} viewBox="0 0 32 22" fill="white">
      <path d="M11 8 C12.3 5 14.8 3 17.8 3 C20.5 3 23 4.7 24 7 C24.7 6.8 25.4 6.7 26 6.7 C29 6.7 31.5 9.2 31.5 12.2 C31.5 12.5 31.5 12.8 31.4 13 C31 13 30.7 12.9 30.3 12.9 C28.7 12.9 27.2 13.4 26 14.3 C25.2 11.8 22.9 10 20.2 10 C19.4 10 18.7 10.2 18 10.4 C17.3 7.7 14.8 5.7 12 5.7 C11.5 5.7 11 5.8 10.5 5.9 C10.7 6.6 10.9 7.3 11 8 Z M6.5 11.5 C7.5 9 10 7.2 12.8 7.2 C15.5 7.2 18 9 18.8 11.5 C19.5 11.3 20.3 11.2 21.1 11.2 C24.8 11.2 27.8 14 27.8 17.5 C27.8 17.8 27.8 18.2 27.7 18.5 L4 18.5 C2.6 18 1.5 16.7 1.5 15 C1.5 12.9 3.5 11.2 5.8 11.2 C6 11.2 6.3 11.3 6.5 11.5 Z"/>
    </svg>
  </Chip>
);

// ── Registry + dispatcher ─────────────────────────────────────────────────
const REGISTRY: Record<string, (p: { size?: number }) => ReactElement> = {
  AAPL: AAPLIcon,  MSFT: MSFTIcon,  NVDA: NVDAIcon,  TSLA: TSLAIcon,
  META: METAIcon,  AMZN: AMZNIcon,  GOOG: GOOGIcon,  GOOGL: GOOGIcon,
  AMD:  AMDIcon,   INTC: INTCIcon,  CRM:  CRMIcon,
};

export const EQUITY_NAME: Record<string, string> = {
  TSLA: "Tesla, Inc.",
  NVDA: "NVIDIA Corp.",
  AAPL: "Apple Inc.",
  META: "Meta Platforms",
  AMZN: "Amazon.com",
  MSFT: "Microsoft Corp.",
  GOOG: "Alphabet Inc.",
  GOOGL:"Alphabet Inc.",
  AMD:  "Advanced Micro Devices",
  INTC: "Intel Corp.",
  CRM:  "Salesforce, Inc.",
};

// Generic neutral chip — only for unsupported tickers; sized to match.
function GenericChip({ sym, size }: { sym: string; size: number }) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #2A3540 0%, #1B232C 100%)"
      glow="rgba(255,255,255,0.15)">
      <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
        <text x="22" y="28" textAnchor="middle"
          fontFamily="'SF Pro Display','Inter',sans-serif"
          fontWeight="800" fontSize={sym.length > 2 ? 13 : 17}
          fill="#FFFFFF" letterSpacing={sym.length > 2 ? "0.3" : "0"}>
          {sym.slice(0, 4).toUpperCase()}
        </text>
      </svg>
    </Chip>
  );
}

export function EquityIcon({ sym, size = 44 }: { sym: string; size?: number }) {
  const Cmp = REGISTRY[sym.toUpperCase()];
  if (Cmp) return <Cmp size={size}/>;
  return <GenericChip sym={sym} size={size}/>;
}

export const SUPPORTED_EQUITIES = ["TSLA","NVDA","AAPL","META","AMZN","MSFT","GOOG","GOOGL","AMD","INTC","CRM"] as const;
