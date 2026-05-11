import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  color?: string;
  icon: LucideIcon;
}

export function StatChip({ label, value, color = "text-foreground", icon: Icon }: Props) {
  return (
    <div className="flex items-center gap-2.5 bg-card border border-border/40 rounded-xl px-3 py-2.5 flex-1 min-w-[100px]">
      <Icon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
      <div className="min-w-0">
        <div className={`text-base font-bold font-mono leading-none ${color}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground/50 mt-0.5">{label}</div>
      </div>
    </div>
  );
}
