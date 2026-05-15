import { Link, useLocation } from "wouter";

interface NavItem {
  path:    string;
  label:   string;
  icon:    React.ReactNode;
  isLive?: boolean;
}

function DashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9"/>
      <rect x="11" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5"/>
      <rect x="1" y="11" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.5"/>
      <rect x="11" y="11" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.7"/>
    </svg>
  );
}
function SignalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 13 C 3 13, 4 5, 6 5 S 8 10, 10 10 S 13 7, 14 7 S 16 9, 17 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
function PortfolioIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="10" width="3" height="7" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="6" y="6"  width="3" height="11" rx="1" fill="currentColor" opacity="0.7"/>
      <rect x="11" y="3" width="3" height="14" rx="1" fill="currentColor" opacity="0.9"/>
      <rect x="16" y="7" width="2" height="10" rx="1" fill="currentColor" opacity="0.6"/>
    </svg>
  );
}
function AccountIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <path d="M2 16c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

const ITEMS: NavItem[] = [
  { path: "/",          label: "Dashboard", icon: <DashIcon />       },
  { path: "/signals",   label: "Signals",   icon: <SignalIcon />     },
  { path: "/portfolio", label: "Portfolio", icon: <PortfolioIcon />  },
  { path: "/live",      label: "Live",      isLive: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 1L11.5 7H17L12.5 10.5L14.5 17L9 13L3.5 17L5.5 10.5L1 7H6.5L9 1Z"
          fill="currentColor" opacity="0.9"/>
      </svg>
    ),
  },
  { path: "/account",   label: "Account",   icon: <AccountIcon />    },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav style={{
      background:  "#020a14",
      borderTop:   "1px solid #0d2035",
      display:     "flex",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      flexShrink: 0,
    }}>
      {ITEMS.map(item => {
        const active = location === item.path
          || (item.path !== "/" && location.startsWith(item.path));

        const activeColor = item.isLive ? "#00ff8a" : "#00aaff";

        return (
          <Link key={item.path} href={item.path} style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            3,
            height:         56,
            textDecoration: "none",
            color:          active ? activeColor : "#1e3a50",
            transition:     "color 0.2s ease",
            position:       "relative",
          }}>
            {/* Active top indicator */}
            {active && (
              <div style={{
                position:     "absolute",
                top:          0,
                left:         "50%",
                transform:    "translateX(-50%)",
                width:        24,
                height:       2,
                background:   activeColor,
                borderRadius: "0 0 2px 2px",
                boxShadow:    `0 0 8px ${activeColor}`,
              }} />
            )}

            {/* Live tab special badge */}
            {item.isLive && (
              <div style={{
                position:   "absolute",
                top:        8,
                right:      "calc(50% - 18px)",
                width:      6,
                height:     6,
                borderRadius: "50%",
                background: "#00ff8a",
                boxShadow:  "0 0 8px #00ff8a",
                animation:  active ? "none" : "nav-pulse 2s ease infinite",
              }} />
            )}

            <span style={{
              color:     active ? activeColor : "#1e3a50",
              transition: "color 0.2s ease",
            }}>
              {item.icon}
            </span>

            <span style={{
              fontSize:      8,
              fontFamily:    "monospace",
              fontWeight:    700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color:         active ? activeColor : "#1e3a50",
              transition:    "color 0.2s ease",
            }}>
              {item.label}
            </span>
          </Link>
        );
      })}
      <style>{`
        @keyframes nav-pulse {
          0%, 100% { opacity: 1;   box-shadow: 0 0 8px #00ff8a; }
          50%       { opacity: 0.3; box-shadow: 0 0 3px #00ff8a; }
        }
      `}</style>
    </nav>
  );
}
