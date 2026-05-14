import React from "react";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

// ── Deterministic sparkline data ───────────────────────────────────────────────

export function genSparkData(symbol: string, direction: "up" | "down" | "flat", points = 22): number[] {
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = 100;
  const data: number[] = [];
  for (let i = 0; i < points; i++) {
    const trendSlope = direction === "up" ? 0.4 : direction === "down" ? -0.4 : 0.05;
    const wave1 = Math.sin(i * 0.7 + seed * 0.1) * 3.5;
    const wave2 = Math.cos(i * 1.2 + seed * 0.05) * 1.8;
    const val = base + trendSlope * i + wave1 + wave2;
    data.push(i === 0 ? base : Math.max(val, base * 0.85));
  }
  return data;
}

// ── Smooth bezier path ─────────────────────────────────────────────────────────

function smoothPath(data: number[], w: number, h: number, pad = 2): string {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: pad + (1 - (v - min) / range) * (h - pad * 2),
  }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cpx = (pts[i].x + pts[i + 1].x) / 2;
    d += ` C ${cpx.toFixed(1)} ${pts[i].y.toFixed(1)} ${cpx.toFixed(1)} ${pts[i + 1].y.toFixed(1)} ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function fillPath(line: string, data: number[], w: number, h: number, pad = 2): string {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const firstX = pad;
  const lastX  = w - pad;
  const firstY = pad + (1 - (data[0] - min) / range) * (h - pad * 2);
  return `${line} L ${lastX.toFixed(1)} ${h} L ${firstX.toFixed(1)} ${h} Z`;
}

// ── MiniSparkline ──────────────────────────────────────────────────────────────

interface Props {
  data:   number[];
  color:  string;
  width?: number;
  height?: number;
  showFill?: boolean;
  strokeWidth?: number;
}

export function MiniSparkline({
  data, color, width = 80, height = 34, showFill = true, strokeWidth = 1.5,
}: Props) {
  const line = smoothPath(data, width, height);
  const fill = fillPath(line, data, width, height);
  const gradId = `sg_${color.replace("#", "")}`;

  return (
    <Svg width={width} height={height}>
      {showFill && (
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor={color} stopOpacity={0.20} />
            <Stop offset="100%" stopColor={color} stopOpacity={0}    />
          </LinearGradient>
        </Defs>
      )}
      {showFill && <Path d={fill} fill={`url(#${gradId})`} />}
      <Path d={line} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
