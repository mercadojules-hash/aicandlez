import { Link, useLocation } from "wouter";

const C   = "#00e5ff";
const DIM = "#3a4a5a";
const BG  = "#000000";

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <path d="M2 9.5L11 2L20 9.5V20H14V14H8V20H2V9.5Z"
      stroke={active ? C : DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      fill={active ? `${C}10` : "none"}/>
  </svg>
);

const TradeIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <polyline points="3,16 8,10 13,13 19,6"
      stroke={active ? C : DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline points="14,6 19,6 19,11"
      stroke={active ? C : DIM} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    {active && <circle cx="19" cy="6" r="2" fill={C} opacity="0.7"/>}
  </svg>
);

const CryptoIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <circle cx="11" cy="11" r="8" stroke={active ? C : DIM} strokeWidth="1.5" fill={active ? `${C}08` : "none"}/>
    <path d="M11 7v1M11 14.5v1M8.5 10a2.5 2.5 0 0 1 2.5-2.5h1.5a2 2 0 1 1 0 4H10a2 2 0 1 1 0 4h2a2.5 2.5 0 0 1 2.5-2.5"
      stroke={active ? C : DIM} strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const EquitiesIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <line x1="6"  y1="3"  x2="6"  y2="6"  stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round"/>
    <rect x="4"  y="6"  width="4" height="9" rx="0.8"
      stroke={active ? C : DIM} strokeWidth="1.4" fill={active ? `${C}12` : "none"}/>
    <line x1="6"  y1="15" x2="6"  y2="19" stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="16" y1="4"  x2="16" y2="7"  stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round"/>
    <rect x="14" y="7"  width="4" height="7" rx="0.8"
      stroke={active ? C : DIM} strokeWidth="1.4" fill={active ? `${C}12` : "none"}/>
    <line x1="16" y1="14" x2="16" y2="19" stroke={active ? C : DIM} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const ProfileIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none" shapeRendering="geometricPrecision">
    <circle cx="11" cy="7.5" r="3.5" stroke={active ? C : DIM} strokeWidth="1.5"
      fill={active ? `${C}10` : "none"}/>
    <path d="M3 19.5c0-3.866 3.582-7 8-7s8 3.134 8 7"
      stroke={active ? C : DIM} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const TABS = [
  { path:"/",         label:"Home",     Icon:HomeIcon     },
  { path:"/trade",    label:"Trade",    Icon:TradeIcon    },
  { path:"/markets",  label:"Crypto",   Icon:CryptoIcon   },
  { path:"/equities", label:"Equities", Icon:EquitiesIcon },
  { path:"/profile",  label:"Profile",  Icon:ProfileIcon  },
];

export function BottomNav() {
  const [location] = useLocation();
  const isActive = (p: string) =>
    p === "/" ? location === "/" : location === p || location.startsWith(p + "/");

  return (
    <nav style={{
      background: "transparent",
      padding: "6px 14px calc(6px + env(safe-area-inset-bottom, 0px))",
      flexShrink: 0,
    }}>
      <div style={{
        background: "rgba(6,14,24,0.94)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 28,
        display: "flex",
        boxShadow: [
          "0 8px 32px rgba(0,0,0,0.70)",
          "0 2px 8px rgba(0,0,0,0.50)",
          "0 0 0 0.5px rgba(0,229,255,0.06) inset",
        ].join(", "),
        overflow: "hidden",
      }}>

        <style>{`
          @keyframes nav-pop { 0%{transform:scale(1)} 40%{transform:scale(0.88)} 100%{transform:scale(1)} }
          .nav-tab:active > .nav-icon { animation: nav-pop 0.22s ease-out; }
        `}</style>

        {TABS.map(({ path, label, Icon }) => {
          const active = isActive(path);
          return (
            <Link key={path} href={path}
              className="nav-tab"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                height: 58,
                textDecoration: "none",
                position: "relative",
                transition: "background 0.2s ease",
                background: active ? "rgba(0,229,255,0.05)" : "transparent",
              }}>

              {/* Active top indicator line */}
              {active && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 28,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${C}, transparent)`,
                  boxShadow: `0 0 10px ${C}80`,
                  borderRadius: "0 0 3px 3px",
                }}/>
              )}

              {/* Active ambient glow */}
              {active && (
                <div aria-hidden style={{
                  position: "absolute",
                  bottom: 6,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 40,
                  height: 20,
                  borderRadius: "50%",
                  background: `radial-gradient(ellipse, ${C}18, transparent 70%)`,
                  pointerEvents: "none",
                }}/>
              )}

              <div className="nav-icon">
                <Icon active={active}/>
              </div>

              <span style={{
                fontSize: 8,
                fontFamily: "Inter, -apple-system, sans-serif",
                fontWeight: 700,
                letterSpacing: "0.09em",
                textTransform: "uppercase" as const,
                color: active ? C : DIM,
                transition: "color 0.2s ease",
              }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
