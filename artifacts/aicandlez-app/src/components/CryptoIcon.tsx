// ═══════════════════════════════════════════════════════════════════════════
// Real branded crypto asset icons — inline SVG, recognizable, premium
// Shared across Home, AI Signals, Markets, etc.
// ═══════════════════════════════════════════════════════════════════════════

type CryptoIconProps = { size?: number; glow?: boolean };

const BRAND      = "#66FF66";
const BRAND_DEEP = "#00C853";
const BORDER_HI  = "rgba(102,255,102,0.22)";
const BRAND_BLOOM = "rgba(102,255,102,0.18)";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";

export function BTCIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #F7931A 0%, #C76E0F 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(247,147,26,0.45), inset 0 0 10px rgba(255,255,255,0.10)" : "none",
    }}>
      <svg width={size*0.62} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M21.34 14.4c.3-1.98-1.21-3.04-3.27-3.75l.67-2.68-1.63-.41-.65 2.61c-.43-.11-.87-.21-1.31-.31l.66-2.63-1.63-.41-.67 2.68c-.36-.08-.71-.16-1.05-.25v-.01l-2.25-.56-.43 1.74s1.21.28 1.18.3c.66.16.78.6.76.95l-.77 3.05c.05.01.11.03.17.05l-.17-.04-1.07 4.28c-.08.2-.28.5-.74.38.02.02-1.18-.3-1.18-.3l-.81 1.87 2.13.53c.4.1.78.21 1.16.3l-.68 2.71 1.63.41.67-2.68c.44.12.88.23 1.3.34l-.67 2.66 1.63.41.68-2.71c2.78.53 4.86.32 5.74-2.2.71-2.03-.04-3.21-1.51-3.97 1.07-.25 1.87-.95 2.09-2.4zm-3.74 5.24c-.5 2.03-3.91.93-5.01.66l.9-3.59c1.1.27 4.64.82 4.11 2.93zm.5-5.27c-.46 1.84-3.3.91-4.21.68l.81-3.25c.91.23 3.88.65 3.4 2.57z" fill="white"/>
      </svg>
    </div>
  );
}

export function ETHIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #6F7DEE 0%, #3A4DB5 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(98,126,234,0.45), inset 0 0 10px rgba(255,255,255,0.10)" : "none",
    }}>
      <svg width={size*0.50} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M16 2 L16 11.7 L24.5 15.5 Z" fill="white" opacity="0.95"/>
        <path d="M16 2 L16 11.7 L7.5 15.5 Z" fill="white" opacity="0.65"/>
        <path d="M16 14 L16 22 L24.5 17 Z" fill="white" opacity="0.85"/>
        <path d="M16 14 L16 22 L7.5 17 Z" fill="white" opacity="0.55"/>
        <path d="M16 23.5 L16 30 L24.5 18.5 Z" fill="white" opacity="0.85"/>
        <path d="M16 23.5 L16 30 L7.5 18.5 Z" fill="white" opacity="0.55"/>
      </svg>
    </div>
  );
}

export function SOLIcon({ size = 36, glow = true }: CryptoIconProps) {
  const gid = `sol-g-${size}`;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #0A0F1E 0%, #1A2640 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(20,241,149,0.40), inset 0 0 10px rgba(20,241,149,0.10)" : "none",
    }}>
      <svg width={size*0.62} height={size*0.42} viewBox="0 0 32 22" fill="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14F195"/><stop offset="100%" stopColor="#9945FF"/>
          </linearGradient>
        </defs>
        <path d="M6 4 L26 4 L24 0 L4 0 Z" fill={`url(#${gid})`}/>
        <path d="M6 13 L26 13 L24 9 L4 9 Z" fill={`url(#${gid})`} opacity="0.85"/>
        <path d="M6 22 L26 22 L24 18 L4 18 Z" fill={`url(#${gid})`} opacity="0.7"/>
      </svg>
    </div>
  );
}

export function ADAIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #1259D6 0%, #0033AD 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
      boxShadow: glow ? "0 0 14px rgba(18,89,214,0.45), inset 0 0 10px rgba(255,255,255,0.08)" : "none",
    }}>
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
    </div>
  );
}

export function AVAXIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #E84142 0%, #B0282A 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(232,65,66,0.45), inset 0 0 10px rgba(255,255,255,0.08)" : "none",
    }}>
      <svg width={size*0.58} height={size*0.58} viewBox="0 0 32 32" fill="none">
        <path d="M16 6 L26 24 L20 24 L17.6 19.6 L14.4 19.6 L16 16.6 L17 18.6 L19 18.6 L16 12.6 L11 24 L6 24 Z" fill="white"/>
      </svg>
    </div>
  );
}

export function DOGEIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #D9B848 0%, #A38525 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(217,184,72,0.45), inset 0 0 10px rgba(255,255,255,0.10)" : "none",
    }}>
      <svg width={size*0.6} height={size*0.65} viewBox="0 0 24 26" fill="none">
        <path d="M5 2 L13 2 C18.5 2 22 6 22 13 C22 20 18.5 24 13 24 L5 24 Z M9 6 L9 11 L7 11 L7 15 L9 15 L9 20 L13 20 C16 20 18 17.5 18 13 C18 8.5 16 6 13 6 Z" fill="white"/>
      </svg>
    </div>
  );
}

export function GenericTokenIcon({ sym, size = 36 }: { sym: string; size?: number }) {
  const letter = sym.replace("USD","").replace("USDT","").slice(0,3)[0] ?? "?";
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

export function CryptoIcon({ sym, size = 36, glow = true }: { sym: string; size?: number; glow?: boolean }) {
  const s = sym.replace("USDT","").replace("USD","");
  switch (s) {
    case "BTC":  return <BTCIcon size={size} glow={glow}/>;
    case "ETH":  return <ETHIcon size={size} glow={glow}/>;
    case "SOL":  return <SOLIcon size={size} glow={glow}/>;
    case "ADA":  return <ADAIcon size={size} glow={glow}/>;
    case "AVAX": return <AVAXIcon size={size} glow={glow}/>;
    case "DOGE": return <DOGEIcon size={size} glow={glow}/>;
    default:     return <GenericTokenIcon sym={sym} size={size}/>;
  }
}

export const SYM_LABEL: Record<string,string> = {
  BTCUSD:"Bitcoin",    ETHUSD:"Ethereum",     SOLUSD:"Solana",
  ADAUSD:"Cardano",    AVAXUSD:"Avalanche",   DOGEUSD:"Dogecoin",
  XRPUSD:"Ripple",     LINKUSD:"Chainlink",   HBARUSD:"Hedera",
  SUIUSD:"Sui",        LTCUSD:"Litecoin",     BCHUSD:"Bitcoin Cash",
  PEPEUSD:"Pepe",      SHIBUSD:"Shiba Inu",   DOTUSD:"Polkadot",
  NEARUSD:"NEAR Protocol", FETUSD:"Fetch.ai", TAOUSD:"Bittensor",
  AAVEUSD:"Aave",      UNIUSD:"Uniswap",
};
export const SYM_SHORT: Record<string,string> = {
  BTCUSD:"BTC",   ETHUSD:"ETH",   SOLUSD:"SOL",   ADAUSD:"ADA",
  AVAXUSD:"AVAX", DOGEUSD:"DOGE", XRPUSD:"XRP",   LINKUSD:"LINK",
  HBARUSD:"HBAR", SUIUSD:"SUI",   LTCUSD:"LTC",   BCHUSD:"BCH",
  PEPEUSD:"PEPE", SHIBUSD:"SHIB", DOTUSD:"DOT",   NEARUSD:"NEAR",
  FETUSD:"FET",   TAOUSD:"TAO",   AAVEUSD:"AAVE", UNIUSD:"UNI",
};
