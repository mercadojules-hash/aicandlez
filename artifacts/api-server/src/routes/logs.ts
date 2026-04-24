import { Router } from "express";
import { db } from "@workspace/db";
import { logsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/logs", async (req, res) => {
  const limit = parseInt((req.query.limit as string) ?? "100", 10);

  const logs = await db
    .select()
    .from(logsTable)
    .orderBy(desc(logsTable.timestamp))
    .limit(limit);

  res.json(
    logs.map((l) => ({
      id: l.id,
      type: l.type,
      level: l.level,
      message: l.message,
      details: l.details ?? null,
      timestamp: l.timestamp.toISOString(),
    }))
  );
});

export default router;
