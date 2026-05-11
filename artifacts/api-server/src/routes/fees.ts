import { Router } from "express";
import { getFeeSummary, getAllFees } from "../lib/feeLedger.js";

const router = Router();

router.get("/fees", (_req, res) => {
  res.json(getFeeSummary());
});

router.get("/fees/all", (_req, res) => {
  res.json(getAllFees());
});

export default router;
