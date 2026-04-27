import { Router, type IRouter } from "express";
import path from "path";

const router: IRouter = Router();

const ZIP_PATH = path.resolve(
  import.meta.dirname,
  "../../natura-web/public/natura-ai.zip",
);

router.get("/download-zip", (_req, res) => {
  res.download(ZIP_PATH, "natura-ai.zip", (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "ZIP file not found" });
    }
  });
});

export default router;
