import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  console.warn(
    "[drizzle-kit] DATABASE_URL is not set — migrations will fail. " +
    "Set DATABASE_URL before running `pnpm --filter @workspace/db run migrate`.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/aicandlez",
  },
});
