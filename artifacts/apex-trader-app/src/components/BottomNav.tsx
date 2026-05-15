import { Link, useLocation } from "wouter";

// ── Icons ──────────────────────────────────────────────────────────────────────
const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <path d="M2 9.5L11 2L20 9.5V20H14V14H8V20H2V9.5Z"
      stroke={active ? "#00e5ff" : "#3a3f5c"} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const TradeIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <polyline points="3,16 8,10 13,13 19,6"
      stroke={active ? "#00e5ff" : "#3a3f5c"} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="14,6 19,6 19,11"
      stroke={active ? "#00e5ff" : "#3a3f5c"} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const MarketsIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="3" y="13" width="3" height="7" rx="1"
      fill={active ? "#00e5ff" : "#3a3f5c"} />
    <rect x="9" y="9"  width="3" height="11" rx="1"
      fill={active ? "#00e5ff" : "#3a3f5c"} opacity="0.85" />
    <rect x="15" y="4" width="3" height="16" rx="1"
      fill={active ? "#00e5ff" : "#3a3f5c"} opacity="0.7" />
  </svg>
);

const ProfileIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <circle cx="11" cy="7.5" r="3.5"
      stroke={active ? "#00e5ff" : "#3a3f5c"} strokeWidth="1.5" fill="none" />
    <path d="M3 19.5c0-3.866 3.582-7 8-7s8 3.134 8 7"
      stroke={active ? "#00e5ff" : "#3a3f5c"} strokeWidth="1.5"
      strokeLinecap="round" fill="none" />
  </svg>
);

const TABS = [
  { path: "/",        label: "Home",    Icon: HomeIcon    },
  { path: "/trade",   label: "Trade",   Icon: TradeIcon   },
  { path: "/markets", label: "Markets", Icon: MarketsIcon },
  { path: "/profile", label: "Profile", Icon: ProfileIcon },
];

export function BottomNav() {
  const [location] = useLocation();

  const isActive = (path: string) =>
    path === "/"
      ? location === "/"
      : location === path || location.startsWith(path + "/");

  return (
    <nav style={{
      background:    "#070710",
      borderTop:     "1px solid #1a1c2e",
      display:       "flex",
      paddingBottom: "env(safe-area-inset-bottom, 4px)",
      flexShrink:    0,
    }}>
      {TABS.map(({ path, label, Icon }) => {
        const active = isActive(path);
        return (
          <Link key={path} href={path} style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            4,
            height:         58,
            textDecoration: "none",
            position:       "relative",
          }}>
            {active && (
              <div style={{
                position:   "absolute",
                top:        0,
                left:       "50%",
                transform:  "translateX(-50%)",
                width:      32,
                height:     2,
                background: "#00e5ff",
                borderRadius: "0 0 2px 2px",
                boxShadow:  "0 0 10px #00e5ff80",
              }} />
            )}
            <Icon active={active} />
            <span style={{
              fontSize:      8,
              fontFamily:    "monospace",
              fontWeight:    700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color:         active ? "#00e5ff" : "#3a3f5c",
            }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
