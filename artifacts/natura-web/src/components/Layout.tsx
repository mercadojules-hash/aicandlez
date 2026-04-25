import { BottomNav } from "./BottomNav";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="screen-content">{children}</div>
      <BottomNav />
    </div>
  );
}
