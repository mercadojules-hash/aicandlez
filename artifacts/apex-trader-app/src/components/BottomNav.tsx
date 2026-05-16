import { Link, useLocation } from "wouter";

const C   = "#00e5ff";
const DIM = "#647385";

// ── Icons ─────────────────────────────────────────────────────────────────────
const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="19" height="19" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <path d="M2 9.5L11 2L20 9.5V20H14V14H8V20H2V9.5Z"
      stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const TradeIcon = ({ active }: { active: boolean }) => (
  <svg width="19" height="19" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <polyline points="3,16 8,10 13,13 19,6"
      stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <polyline points="14,6 19,6 19,11"
      stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

// Coin icon — crypto identity
const CryptoIcon = ({ active }: { active: boolean }) => (
  <svg width="19" height="19" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <circle cx="11" cy="11" r="8" stroke={active ? C : DIM} strokeWidth="1.4" fill="none"/>
    <path d="M11 7v1M11 14.5v1M8.5 10a2.5 2.5 0 0 1 2.5-2.5h1.5a2 2 0 1 1 0 4H10a2 2 0 1 1 0 4h2a2.5 2.5 0 0 1 2.5-2.5"
      stroke={active ? C : DIM} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
  </svg>
);

// Candlestick icon — equities identity
const EquitiesIcon = ({ active }: { active: boolean }) => (
  <svg width="19" height="19" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <line x1="6"  y1="3"  x2="6"  y2="6"  stroke={active ? C : DIM} strokeWidth="1.3" strokeLinecap="round"/>
    <rect x="4"   y="6"   width="4" height="9" rx="0.8"
      stroke={active ? C : DIM} strokeWidth="1.3" fill="none"/>
    <line x1="6"  y1="15" x2="6"  y2="19" stroke={active ? C : DIM} strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="16" y1="4"  x2="16" y2="7"  stroke={active ? C : DIM} strokeWidth="1.3" strokeLinecap="round"/>
    <rect x="14"  y="7"   width="4" height="7" rx="0.8"
      stroke={active ? C : DIM} strokeWidth="1.3" fill="none"/>
    <line x1="16" y1="14" x2="16" y2="19" stroke={active ? C : DIM} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const ProfileIcon = ({ active }: { active: boolean }) => (
  <svg width="19" height="19" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <circle cx="11" cy="7.5" r="3.5" stroke={active ? C : DIM} strokeWidth="1.4" fill="none"/>
    <path d="M3 19.5c0-3.866 3.582-7 8-7s8 3.134 8 7"
      stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
  </svg>
);

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = [
  { path:"/",         label:"Home",     Icon:HomeIcon     },
  { path:"/trade",    label:"Trade",    Icon:TradeIcon    },
  { path:"/markets",  label:"Crypto",   Icon:CryptoIcon   },
  { path:"/equities", label:"Equities", Icon:EquitiesIcon },
  { path:"/profile",  label:"Profile",  Icon:ProfileIcon  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function BottomNav() {
  const [location] = useLocation();
  const isActive = (p: string) =>
    p === "/" ? location === "/" : location === p || location.startsWith(p + "/");

  return (
    <nav style={{
      background: "#000000",
      borderTop:  "1px solid rgba(255,255,255,0.07)",
      display:    "flex",
      paddingBottom: "env(safe-area-inset-bottom, 4px)",
      flexShrink: 0,
    }}>
      {TABS.map(({ path, label, Icon }) => {
        const active = isActive(path);
        return (
          <Link key={path} href={path} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 3, height: 54, textDecoration: "none", position: "relative",
          }}>
            {active && (
              <div style={{
                position: "absolute", top: 0, left: "50%",
                transform: "translateX(-50%)",
                width: 20, height: 1.5,
                background: C,
                boxShadow: `0 0 6px ${C}55`,
                borderRadius: "0 0 2px 2px",
              }}/>
            )}
            <Icon active={active}/>
            <span style={{
              fontSize: 7.5, fontFamily: "Inter, -apple-system, sans-serif",
              fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              color: active ? C : DIM,
            }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
