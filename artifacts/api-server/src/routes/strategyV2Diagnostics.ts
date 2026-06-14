import { Router } from "express";
import {
  getStrategyV2Diagnostics,
  getStrategyV2SymbolBlocklist,
  isStrategyV2Enabled,
} from "../lib/strategyV2Gate.js";

const router = Router();

router.get("/diagnostics/strategy-v2", (_req, res) => {
  const runtime = {
    strategyV2Enabled: process.env.STRATEGY_V2_ENABLED ?? null,
    strategyV2SymbolBlocklist: process.env.STRATEGY_V2_SYMBOL_BLOCKLIST ?? null,
    riskGovernorEnabled: process.env.RISK_GOVERNOR_ENABLED ?? null,
  };
  const diagnostics = getStrategyV2Diagnostics();

  res.json({
    runtime,
    derived: {
      strategyV2Enabled: isStrategyV2Enabled(),
      strategyV2SymbolBlocklist: Array.from(getStrategyV2SymbolBlocklist()),
    },
    build: {
      commit:
        process.env.RENDER_GIT_COMMIT ??
        process.env.GIT_COMMIT ??
        process.env.SOURCE_VERSION ??
        null,
    },
    counters: {
      totalExecutions: diagnostics.executions,
      sellBlocks: diagnostics.blocks.sell,
      symbolBlocks: diagnostics.blocks.symbol,
      rsiBlocks: diagnostics.blocks.rsi,
      emaBlocks: diagnostics.blocks.ema,
      trendBlocks: diagnostics.blocks.trend,
      momentumBlocks: diagnostics.blocks.momentum,
    },
    process: {
      startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});

export default router;
