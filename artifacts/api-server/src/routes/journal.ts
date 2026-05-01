import { Router } from "express";
import {
  getJournal, addJournalEntry, updateJournalNotes, deleteJournalEntry, getFeedbackSummary,
} from "../lib/tradeJournalEngine.js";

const router = Router();

// GET /journal/trades — full journal list (newest first)
router.get("/journal/trades", (_req, res) => {
  res.json({ trades: getJournal() });
});

// GET /journal/summary — feedback summary + insights
router.get("/journal/summary", (_req, res) => {
  res.json(getFeedbackSummary());
});

// POST /journal/trades — manually add a trade entry
router.post("/journal/trades", async (req, res) => {
  const {
    symbol, displayName, side, entryPrice, exitPrice,
    entryTime, exitTime, sizeUSD, realizedPnL, realizedPnLPct,
    durationMs, closeReason, reasoning, notes, tags,
  } = req.body ?? {};

  if (!symbol || !side || !entryPrice || !exitPrice) {
    res.status(400).json({ error: "Required: symbol, side, entryPrice, exitPrice" });
    return;
  }

  try {
    const entry = await addJournalEntry({
      symbol, displayName: displayName ?? symbol.replace("USD",""),
      side, entryPrice, exitPrice,
      entryTime: entryTime ?? Date.now(),
      exitTime:  exitTime  ?? Date.now(),
      sizeUSD:   sizeUSD   ?? 0,
      realizedPnL:    realizedPnL    ?? 0,
      realizedPnLPct: realizedPnLPct ?? 0,
      durationMs:     durationMs     ?? 0,
      closeReason: closeReason ?? "MANUAL",
      reasoning, notes, tags,
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /journal/trades/:id — update notes on an entry
router.patch("/journal/trades/:id", (req, res) => {
  const { notes } = req.body ?? {};
  const ok = updateJournalNotes(req.params.id!, notes ?? "");
  if (!ok) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json({ ok: true });
});

// DELETE /journal/trades/:id — remove a journal entry
router.delete("/journal/trades/:id", (req, res) => {
  const ok = deleteJournalEntry(req.params.id!);
  if (!ok) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
