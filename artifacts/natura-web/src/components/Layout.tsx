import type { CSSProperties } from "react";
import { BottomNav } from "./BottomNav";

interface LayoutProps {
  children: React.ReactNode;
  bgStyle?: CSSProperties;
}

export function Layout({ children, bgStyle }: LayoutProps) {
  return (
    <div className="app-shell">
      <div className="screen-content" style={bgStyle}>{children}</div>
      <BottomNav />
    </div>
  );
}
