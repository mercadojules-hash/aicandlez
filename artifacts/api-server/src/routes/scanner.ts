import { Router } from "express";
import { runScan } from "../lib/assetScanner.js";

const router = Router();

// Cache last scan result for 30 s to avoid hammering Kraken
let cache: { result: Awaited<ReturnType<typeof runScan>>; at: number } | null = null;
const CACHE_TTL = 30_000;

router.get("/scanner/scan", async (_req, res) => {
  if (cache && Date.now() - cache.at < CACHE_TTL) {
    res.json({ ...cache.result, cached: true });
    return;
  }
  try {
    const result = await runScan();
    cache = { result, at: Date.now() };
    res.json({ ...result, cached: false });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Force refresh (bypass cache)
router.post("/scanner/scan", async (_req, res) => {
  try {
    const result = await runScan();
    cache = { result, at: Date.now() };
    res.json({ ...result, cached: false });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
