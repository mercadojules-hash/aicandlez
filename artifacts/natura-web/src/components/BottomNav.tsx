import { useLocation, useNavigate } from "react-router-dom";
import { Home, MessageCircle, List, BookOpen, User } from "lucide-react";

const TABS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "Ask AI", icon: MessageCircle, path: "/chat" },
  { label: "Plans", icon: List, path: "/plans" },
  { label: "Recipes", icon: BookOpen, path: "/recipes" },
  { label: "Profile", icon: User, path: "/profile" },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <nav className="bottom-nav">
      {TABS.map(({ label, icon: Icon, path }) => {
        const active = location.pathname === base + path || location.pathname === path;
        return (
          <button
            key={path}
            onClick={() => navigate(base + path)}
            className={`bottom-nav-item ${active ? "active" : ""}`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
