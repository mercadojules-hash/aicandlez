import { MODULE_LIST } from "@/components/Layout";
import { Clock, Zap } from "lucide-react";

export default function ComingSoon({ path }: { path: string }) {
  const mod = MODULE_LIST.find((m) => m.path === path);
  if (!mod) return null;
  const Icon = mod.icon;

  return (
    <div className="max-w-[500px] mx-auto mt-20 flex flex-col items-center gap-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border/40 flex items-center justify-center">
        <Icon className="w-7 h-7 text-muted-foreground/30" />
      </div>
      <div>
        <div className="text-xs font-mono text-muted-foreground/40 mb-2 tracking-widest uppercase">
          Module {String(mod.id).padStart(2, "0")} · Not yet built
        </div>
        <h2 className="text-xl font-bold mb-1">{mod.label}</h2>
        <p className="text-sm text-muted-foreground">{mod.sublabel}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground/40 border border-border/20 rounded-full px-4 py-2">
        <Clock className="w-3.5 h-3.5" />
        Awaiting build approval
      </div>
      <div className="border border-primary/20 bg-primary/5 rounded-xl p-4 w-full text-left">
        <div className="flex items-center gap-2 text-xs text-primary font-semibold mb-2">
          <Zap className="w-3.5 h-3.5" />
          Ready to build on your command
        </div>
        <p className="text-xs text-muted-foreground">
          Once Module {mod.id - 1 > 0 ? mod.id - 1 : 1} is approved, confirm and this module will be built next — one module at a time.
        </p>
      </div>
    </div>
  );
}
