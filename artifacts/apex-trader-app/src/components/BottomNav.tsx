import { Link, useLocation } from "wouter";

interface NavItem {
  path:  string;
  label: string;
  icon:  string;
}

const ITEMS: NavItem[] = [
  { path: "/",          label: "Dashboard", icon: "⬡" },
  { path: "/signals",   label: "Signals",   icon: "◈" },
  { path: "/portfolio", label: "Portfolio", icon: "◉" },
  { path: "/live",      label: "Live",      icon: "⚡" },
  { path: "/account",   label: "Account",   icon: "◌" },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav style={{
      position:      "fixed",
      bottom:        0,
      left:          0,
      right:         0,
      height:        60,
      background:    "#000508",
      borderTop:     "1px solid #0d2035",
      display:       "flex",
      zIndex:        100,
    }}>
      {ITEMS.map(item => {
        const active = location === item.path || (item.path !== "/" && location.startsWith(item.path));
        return (
          <Link key={item.path} href={item.path} style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            2,
            textDecoration: "none",
            color:          active ? "#00f0ff" : "#2a4060",
            transition:     "color 0.15s ease",
          }}>
            <span style={{ fontSize: item.path === "/live" ? 18 : 16, lineHeight: 1 }}>
              {item.icon}
            </span>
            <span style={{
              fontSize:      9,
              fontFamily:    "monospace",
              fontWeight:    700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color:         active ? "#00f0ff" : "#1e3a50",
            }}>
              {item.label}
            </span>
            {active && (
              <div style={{
                position:     "absolute",
                bottom:       0,
                width:        20,
                height:       2,
                background:   "#00f0ff",
                borderRadius: 1,
                boxShadow:    "0 0 6px #00f0ff",
              }} />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
