// ═══════════════════════════════════════════════════════════════════════════
// Real branded crypto asset icons — inline SVG, recognizable, premium.
// Each ticker uses its canonical brand mark on a brand-colored circular
// chip with matching glow. Shared across Home, AI Signals, Portfolio,
// Markets, Active Trades, Trade History, and any asset card globally.
// ═══════════════════════════════════════════════════════════════════════════

import { type ReactElement } from "react";

type CryptoIconProps = { size?: number; glow?: boolean };

const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const BORDER_HI   = "rgba(102,255,102,0.22)";
const BRAND_BLOOM = "rgba(102,255,102,0.18)";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";

// ── Shared chip wrapper ────────────────────────────────────────────────────
function Chip({
  size, bg, glow, glowColor, children,
}: {
  size:       number;
  bg:         string;
  glow:       boolean;
  glowColor:  string;
  children:   ReactElement;
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? `0 0 14px ${glowColor}, inset 0 0 10px rgba(255,255,255,0.10)` : "none",
    }}>{children}</div>
  );
}

// ── BTC — canonical Bitcoin "B" mark ───────────────────────────────────────
export function BTCIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #F7931A 0%, #C76E0F 100%)"
      glow={glow} glowColor="rgba(247,147,26,0.45)">
      <svg width={size*0.62} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M21.34 14.4c.3-1.98-1.21-3.04-3.27-3.75l.67-2.68-1.63-.41-.65 2.61c-.43-.11-.87-.21-1.31-.31l.66-2.63-1.63-.41-.67 2.68c-.36-.08-.71-.16-1.05-.25v-.01l-2.25-.56-.43 1.74s1.21.28 1.18.3c.66.16.78.6.76.95l-.77 3.05c.05.01.11.03.17.05l-.17-.04-1.07 4.28c-.08.2-.28.5-.74.38.02.02-1.18-.3-1.18-.3l-.81 1.87 2.13.53c.4.1.78.21 1.16.3l-.68 2.71 1.63.41.67-2.68c.44.12.88.23 1.3.34l-.67 2.66 1.63.41.68-2.71c2.78.53 4.86.32 5.74-2.2.71-2.03-.04-3.21-1.51-3.97 1.07-.25 1.87-.95 2.09-2.4zm-3.74 5.24c-.5 2.03-3.91.93-5.01.66l.9-3.59c1.1.27 4.64.82 4.11 2.93zm.5-5.27c-.46 1.84-3.3.91-4.21.68l.81-3.25c.91.23 3.88.65 3.4 2.57z" fill="white"/>
      </svg>
    </Chip>
  );
}

// ── ETH — canonical Ethereum diamond ──────────────────────────────────────
export function ETHIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #6F7DEE 0%, #3A4DB5 100%)"
      glow={glow} glowColor="rgba(98,126,234,0.45)">
      <svg width={size*0.50} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M16 2 L16 11.7 L24.5 15.5 Z" fill="white" opacity="0.95"/>
        <path d="M16 2 L16 11.7 L7.5 15.5 Z" fill="white" opacity="0.65"/>
        <path d="M16 14 L16 22 L24.5 17 Z" fill="white" opacity="0.85"/>
        <path d="M16 14 L16 22 L7.5 17 Z" fill="white" opacity="0.55"/>
        <path d="M16 23.5 L16 30 L24.5 18.5 Z" fill="white" opacity="0.85"/>
        <path d="M16 23.5 L16 30 L7.5 18.5 Z" fill="white" opacity="0.55"/>
      </svg>
    </Chip>
  );
}

// ── SOL — canonical Solana stacked-gradient bars ──────────────────────────
export function SOLIcon({ size = 36, glow = true }: CryptoIconProps) {
  const gid = `sol-g-${size}`;
  return (
    <Chip size={size} bg="linear-gradient(135deg, #0A0F1E 0%, #1A2640 100%)"
      glow={glow} glowColor="rgba(20,241,149,0.40)">
      <svg width={size*0.62} height={size*0.42} viewBox="0 0 32 22" fill="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14F195"/><stop offset="100%" stopColor="#9945FF"/>
          </linearGradient>
        </defs>
        <path d="M6 4 L26 4 L24 0 L4 0 Z"  fill={`url(#${gid})`}/>
        <path d="M6 13 L26 13 L24 9 L4 9 Z" fill={`url(#${gid})`} opacity="0.85"/>
        <path d="M6 22 L26 22 L24 18 L4 18 Z" fill={`url(#${gid})`} opacity="0.7"/>
      </svg>
    </Chip>
  );
}

// ── XRP — canonical Ripple stylized X mark ────────────────────────────────
export function XRPIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #1B1B1B 0%, #2A2A2A 100%)"
      glow={glow} glowColor="rgba(255,255,255,0.30)">
      <svg width={size*0.60} height={size*0.60} viewBox="0 0 32 32" fill="none"
        stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 7 L16 16 L26 7"/>
        <path d="M6 25 L16 16 L26 25"/>
      </svg>
    </Chip>
  );
}

// ── ADA — Cardano radial dot ring ─────────────────────────────────────────
export function ADAIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #1259D6 0%, #0033AD 100%)"
      glow={glow} glowColor="rgba(18,89,214,0.45)">
      <svg width={size*0.7} height={size*0.7} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="1.6" fill="white"/>
        <circle cx="16" cy="7"  r="1.2" fill="white"/>
        <circle cx="16" cy="25" r="1.2" fill="white"/>
        <circle cx="8"  cy="11.5" r="1.2" fill="white"/>
        <circle cx="24" cy="11.5" r="1.2" fill="white"/>
        <circle cx="8"  cy="20.5" r="1.2" fill="white"/>
        <circle cx="24" cy="20.5" r="1.2" fill="white"/>
        <circle cx="6"  cy="16" r="0.9" fill="white" opacity="0.7"/>
        <circle cx="26" cy="16" r="0.9" fill="white" opacity="0.7"/>
      </svg>
    </Chip>
  );
}

// ── AVAX — Avalanche "A" mountain mark ────────────────────────────────────
export function AVAXIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #E84142 0%, #B0282A 100%)"
      glow={glow} glowColor="rgba(232,65,66,0.45)">
      <svg width={size*0.58} height={size*0.58} viewBox="0 0 32 32" fill="none">
        <path d="M16 6 L26 24 L20 24 L17.6 19.6 L14.4 19.6 L16 16.6 L17 18.6 L19 18.6 L16 12.6 L11 24 L6 24 Z" fill="white"/>
      </svg>
    </Chip>
  );
}

// ── DOGE — canonical Shiba silhouette (simplified, recognizable) ──────────
export function DOGEIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #D9B848 0%, #A38525 100%)"
      glow={glow} glowColor="rgba(217,184,72,0.45)">
      <svg width={size*0.62} height={size*0.62} viewBox="0 0 32 32" fill="none">
        {/* Stylized Shiba head: ears, face triangle, snout */}
        <path d="M8 9 L11 6 L13.5 11 Z" fill="white"/>
        <path d="M24 9 L21 6 L18.5 11 Z" fill="white"/>
        <path d="M9 12 C9 19 13 24 16 24 C19 24 23 19 23 12 C20 11 18 10.6 16 10.6 C14 10.6 12 11 9 12 Z" fill="white"/>
        <circle cx="13" cy="15.5" r="1" fill="#A38525"/>
        <circle cx="19" cy="15.5" r="1" fill="#A38525"/>
        <ellipse cx="16" cy="19" rx="1.6" ry="1" fill="#A38525"/>
      </svg>
    </Chip>
  );
}

// ── LINK — Chainlink hexagon ──────────────────────────────────────────────
export function LINKIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #2A5ADA 0%, #1A3FB5 100%)"
      glow={glow} glowColor="rgba(42,90,218,0.50)">
      <svg width={size*0.58} height={size*0.66} viewBox="0 0 26 30" fill="none">
        <path d="M13 2 L23 7.5 L23 18.5 L13 24 L3 18.5 L3 7.5 Z"
          fill="none" stroke="white" strokeWidth="2.2"/>
        <path d="M13 7.5 L18 10.25 L18 15.75 L13 18.5 L8 15.75 L8 10.25 Z" fill="white"/>
      </svg>
    </Chip>
  );
}

// ── LTC — Litecoin Ł mark ─────────────────────────────────────────────────
export function LTCIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #BFBBBB 0%, #7C7B7B 100%)"
      glow={glow} glowColor="rgba(191,187,187,0.40)">
      <svg width={size*0.55} height={size*0.65} viewBox="0 0 24 28" fill="none">
        <path d="M12.5 3 L9.5 14.5 L6.5 15.7 L5.7 18.5 L8.7 17.3 L7 23.5 L20 23.5 L20.8 20.4 L11.6 20.4 L13 14.7 L16 13.5 L16.8 10.7 L13.8 11.9 L16 3 Z"
          fill="white"/>
      </svg>
    </Chip>
  );
}

// ── DOT — Polkadot pink dot constellation ─────────────────────────────────
export function DOTIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #1A1A1A 0%, #2C2C2C 100%)"
      glow={glow} glowColor="rgba(230,0,122,0.50)">
      <svg width={size*0.66} height={size*0.66} viewBox="0 0 32 32" fill="none">
        <ellipse cx="16" cy="6"  rx="3.4" ry="2.6" fill="#E6007A"/>
        <ellipse cx="16" cy="26" rx="3.4" ry="2.6" fill="#E6007A"/>
        <ellipse cx="7.3" cy="11" rx="2.6" ry="3.4" fill="#E6007A" transform="rotate(-30 7.3 11)"/>
        <ellipse cx="24.7" cy="21" rx="2.6" ry="3.4" fill="#E6007A" transform="rotate(-30 24.7 21)"/>
        <ellipse cx="7.3" cy="21" rx="2.6" ry="3.4" fill="#E6007A" transform="rotate(30 7.3 21)"/>
        <ellipse cx="24.7" cy="11" rx="2.6" ry="3.4" fill="#E6007A" transform="rotate(30 24.7 11)"/>
      </svg>
    </Chip>
  );
}

// ── UNI — Uniswap unicorn (simplified pink U) ────────────────────────────
export function UNIIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #FF007A 0%, #B30056 100%)"
      glow={glow} glowColor="rgba(255,0,122,0.50)">
      <svg width={size*0.58} height={size*0.58} viewBox="0 0 32 32" fill="none">
        <path d="M9 8 C9 8 11 14 11 18 C11 21.5 13 24 16 24 C19 24 21 21.5 21 18 C21 17 20.6 16 20 15 L23 14 L21.5 17 C22.4 18 22.8 19.2 22.5 20.5"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
        <circle cx="20" cy="11" r="1" fill="white"/>
      </svg>
    </Chip>
  );
}

// ── AAVE — ghost outline ──────────────────────────────────────────────────
export function AAVEIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #2EBAC6 0%, #B6509E 100%)"
      glow={glow} glowColor="rgba(46,186,198,0.45)">
      <svg width={size*0.58} height={size*0.58} viewBox="0 0 32 32" fill="none">
        <path d="M16 5 L24 25 L20.5 25 L18.5 20 L13.5 20 L11.5 25 L8 25 Z M14.4 17.5 L17.6 17.5 L16 13.4 Z"
          fill="white"/>
      </svg>
    </Chip>
  );
}

// ── MATIC — Polygon stacked hexes ─────────────────────────────────────────
export function MATICIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #8247E5 0%, #5F2EB0 100%)"
      glow={glow} glowColor="rgba(130,71,229,0.50)">
      <svg width={size*0.62} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M11 9.5 L14.5 11.5 L14.5 15.5 L11 17.5 L7.5 15.5 L7.5 11.5 Z" fill="white" opacity="0.85"/>
        <path d="M21 14.5 L24.5 16.5 L24.5 20.5 L21 22.5 L17.5 20.5 L17.5 16.5 Z" fill="white" opacity="0.95"/>
      </svg>
    </Chip>
  );
}

// ── BCH — Bitcoin Cash green B ────────────────────────────────────────────
export function BCHIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <Chip size={size} bg="linear-gradient(135deg, #0AC18E 0%, #079B71 100%)"
      glow={glow} glowColor="rgba(10,193,142,0.50)">
      <svg width={size*0.62} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M21.34 14.4c.3-1.98-1.21-3.04-3.27-3.75l.67-2.68-1.63-.41-.65 2.61c-.43-.11-.87-.21-1.31-.31l.66-2.63-1.63-.41-.67 2.68c-.36-.08-.71-.16-1.05-.25v-.01l-2.25-.56-.43 1.74s1.21.28 1.18.3c.66.16.78.6.76.95l-.77 3.05c.05.01.11.03.17.05l-.17-.04-1.07 4.28c-.08.2-.28.5-.74.38.02.02-1.18-.3-1.18-.3l-.81 1.87 2.13.53c.4.1.78.21 1.16.3l-.68 2.71 1.63.41.67-2.68c.44.12.88.23 1.3.34l-.67 2.66 1.63.41.68-2.71c2.78.53 4.86.32 5.74-2.2.71-2.03-.04-3.21-1.51-3.97 1.07-.25 1.87-.95 2.09-2.4zm-3.74 5.24c-.5 2.03-3.91.93-5.01.66l.9-3.59c1.1.27 4.64.82 4.11 2.93zm.5-5.27c-.46 1.84-3.3.91-4.21.68l.81-3.25c.91.23 3.88.65 3.4 2.57z" fill="white"/>
      </svg>
    </Chip>
  );
}

// ── Generic fallback (rare paths only — most tickers have explicit logos) ─
export function GenericTokenIcon({ sym, size = 36 }: { sym: string; size?: number }) {
  const letter = sym.replace("USDT","").replace("USD","").slice(0,3)[0] ?? "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${BRAND_DEEP}55, ${BRAND}22)`,
      border: `1px solid ${BORDER_HI}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: BRAND, fontFamily: SANS, fontWeight: 800, fontSize: size*0.36,
      boxShadow: `0 0 12px ${BRAND_BLOOM}`,
    }}>{letter}</div>
  );
}

// ── Dispatcher ─────────────────────────────────────────────────────────────
export function CryptoIcon({ sym, size = 36, glow = true }: { sym: string; size?: number; glow?: boolean }) {
  const s = sym.replace("USDT","").replace("USD","");
  switch (s) {
    case "BTC":   return <BTCIcon   size={size} glow={glow}/>;
    case "ETH":   return <ETHIcon   size={size} glow={glow}/>;
    case "SOL":   return <SOLIcon   size={size} glow={glow}/>;
    case "XRP":   return <XRPIcon   size={size} glow={glow}/>;
    case "ADA":   return <ADAIcon   size={size} glow={glow}/>;
    case "AVAX":  return <AVAXIcon  size={size} glow={glow}/>;
    case "DOGE":  return <DOGEIcon  size={size} glow={glow}/>;
    case "LINK":  return <LINKIcon  size={size} glow={glow}/>;
    case "LTC":   return <LTCIcon   size={size} glow={glow}/>;
    case "DOT":   return <DOTIcon   size={size} glow={glow}/>;
    case "UNI":   return <UNIIcon   size={size} glow={glow}/>;
    case "AAVE":  return <AAVEIcon  size={size} glow={glow}/>;
    case "MATIC": return <MATICIcon size={size} glow={glow}/>;
    case "POL":   return <MATICIcon size={size} glow={glow}/>;
    case "BCH":   return <BCHIcon   size={size} glow={glow}/>;
    default:      return <GenericTokenIcon sym={sym} size={size}/>;
  }
}

// ── Symbol metadata used by callers (unchanged) ────────────────────────────
export const SYM_LABEL: Record<string,string> = {
  BTCUSD:"Bitcoin",    ETHUSD:"Ethereum",     SOLUSD:"Solana",
  ADAUSD:"Cardano",    AVAXUSD:"Avalanche",   DOGEUSD:"Dogecoin",
  XRPUSD:"Ripple",     LINKUSD:"Chainlink",   HBARUSD:"Hedera",
  SUIUSD:"Sui",        LTCUSD:"Litecoin",     BCHUSD:"Bitcoin Cash",
  PEPEUSD:"Pepe",      SHIBUSD:"Shiba Inu",   DOTUSD:"Polkadot",
  NEARUSD:"NEAR Protocol", FETUSD:"Fetch.ai", TAOUSD:"Bittensor",
  AAVEUSD:"Aave",      UNIUSD:"Uniswap",      MATICUSD:"Polygon",
};
export const SYM_SHORT: Record<string,string> = {
  BTCUSD:"BTC",   ETHUSD:"ETH",   SOLUSD:"SOL",   ADAUSD:"ADA",
  AVAXUSD:"AVAX", DOGEUSD:"DOGE", XRPUSD:"XRP",   LINKUSD:"LINK",
  HBARUSD:"HBAR", SUIUSD:"SUI",   LTCUSD:"LTC",   BCHUSD:"BCH",
  PEPEUSD:"PEPE", SHIBUSD:"SHIB", DOTUSD:"DOT",   NEARUSD:"NEAR",
  FETUSD:"FET",   TAOUSD:"TAO",   AAVEUSD:"AAVE", UNIUSD:"UNI",
  MATICUSD:"MATIC",
};
