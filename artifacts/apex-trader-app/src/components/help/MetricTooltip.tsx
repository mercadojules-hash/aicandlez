// T008 + T011: Tap-to-expand metric explanation tooltip for advanced AI metrics.
// Usage:  <MetricTooltip term="AI Confidence" />
//         <MetricTooltip term="Exposure" inline />

import { useState } from "react";
import { GLOSSARY } from "@/hooks/useOnboarding";

const SANS = "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif";
const C    = "#00e5ff";

interface MetricTooltipProps {
  term:    string;
  inline?: boolean;   // true → inline ⓘ icon only; false (default) → full label + icon
}

export function MetricTooltip({ term, inline = false }: MetricTooltipProps) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[term];
  if (!entry) return null;

  return (
    <span style={{ position:"relative", display:"inline-flex", alignItems:"center", gap:3 }}>
      {!inline && (
        <span style={{ fontSize:7, fontFamily:SANS, fontWeight:600,
          color:"rgba(136,146,164,0.70)", letterSpacing:"0.12em",
          textTransform:"uppercase" as const }}>
          {term}
        </span>
      )}

      {/* ⓘ icon */}
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          width:14, height:14, borderRadius:"50%", flexShrink:0,
          background: open ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.06)",
          border:`1px solid ${open ? "rgba(0,229,255,0.35)" : "rgba(255,255,255,0.12)"}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer", padding:0, lineHeight:1,
          fontSize:8, fontFamily:SANS, fontWeight:700,
          color: open ? C : "rgba(136,146,164,0.70)",
          transition:"all 0.15s",
        }}
        aria-label={`What is ${term}?`}
      >ⓘ</button>

      {/* Popover */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position:"absolute", bottom:"calc(100% + 6px)", left:"50%",
            transform:"translateX(-50%)",
            zIndex:200, minWidth:210, maxWidth:260,
            background:"#0d1a28", border:"1px solid rgba(0,229,255,0.18)",
            borderRadius:10, padding:"10px 12px",
            boxShadow:"0 8px 24px rgba(0,0,0,0.85)",
            cursor:"default",
          }}
        >
          <div style={{ fontSize:9, fontFamily:SANS, fontWeight:700, color:C,
            letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:5 }}>
            {term}
          </div>
          <div style={{ fontSize:11, fontFamily:SANS, color:"rgba(255,255,255,0.80)",
            lineHeight:1.65, marginBottom:5 }}>
            {entry.detail}
          </div>
          <div style={{ fontSize:9, fontFamily:SANS, color:"rgba(0,229,255,0.55)",
            fontStyle:"italic" }}>
            Tap anywhere to close
          </div>
          {/* Arrow */}
          <div style={{
            position:"absolute", bottom:-5, left:"50%",
            width:8, height:8, background:"#0d1a28",
            border:"1px solid rgba(0,229,255,0.18)",
            borderTop:"none", borderLeft:"none",
            transform:"translateX(-50%) rotate(45deg)",
          }}/>
        </div>
      )}
    </span>
  );
}
