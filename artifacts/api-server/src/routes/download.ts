import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

const DIST_DIR    = import.meta.dirname;
const NATURA_ZIP  = path.resolve(DIST_DIR, "natura-ai.zip");
const PROD_ZIP    = path.resolve(DIST_DIR, "apex-trader-production.zip");

router.get("/download-zip", (_req, res) => {
  if (!fs.existsSync(NATURA_ZIP)) {
    res.status(503).json({ error: "ZIP not yet built" });
    return;
  }
  res.download(NATURA_ZIP, "natura-ai.zip", (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Download failed", detail: String(err) });
    }
  });
});

// ── Final master production bundle ────────────────────────────────────────────
router.get("/download-production", (_req, res) => {
  if (!fs.existsSync(PROD_ZIP)) {
    res.status(503).json({ error: "Production ZIP not yet built — run a fresh build" });
    return;
  }
  res.download(PROD_ZIP, "apex-trader-production.zip", (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Download failed", detail: String(err) });
    }
  });
});

export default router;
