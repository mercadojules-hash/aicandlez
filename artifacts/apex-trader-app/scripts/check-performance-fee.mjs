#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ALLOWED = new Set([join(ROOT, "lib", "fees.ts")]);

const BAD = [
  /2\s*%[^\n]{0,40}performance\s+fee/i,
  /performance\s+fee[^\n]{0,40}2\s*%/i,
  /performance\s+fees?\s*\(\s*2\s*%\s*\)/i,
];

const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    if (ALLOWED.has(p)) continue;
    const text = readFileSync(p, "utf8");
    text.split("\n").forEach((line, i) => {
      for (const rx of BAD) {
        if (rx.test(line)) {
          offenders.push(`${p}:${i + 1}: ${line.trim()}`);
          break;
        }
      }
    });
  }
}

walk(ROOT);

if (offenders.length) {
  console.error("Hardcoded 2% performance-fee strings detected.");
  console.error("AICandlez fee is 3% — import PERFORMANCE_FEE_LABEL from '@/lib/fees' instead.\n");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log("OK: no hardcoded 2% performance-fee strings found.");
