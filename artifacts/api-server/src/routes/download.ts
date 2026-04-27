import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

const ZIP_PATH = path.resolve(import.meta.dirname, "natura-ai.zip");

router.get("/download-zip", (_req, res) => {
  if (!fs.existsSync(ZIP_PATH)) {
    res.status(503).json({ error: "ZIP not yet built", path: ZIP_PATH });
    return;
  }
  res.download(ZIP_PATH, "natura-ai.zip", (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Download failed", detail: String(err) });
    }
  });
});

export default router;
