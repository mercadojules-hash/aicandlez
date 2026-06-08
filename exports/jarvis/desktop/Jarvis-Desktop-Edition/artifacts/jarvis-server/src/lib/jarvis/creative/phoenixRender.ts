import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PhoenixStoryboard, PhoenixVideoFormat } from "./types.js";

/**
 * Phoenix programmatic video renderer (Tier-1).
 *
 * Renders a storyboard into an MP4 ENTIRELY PROGRAMMATICALLY using the local
 * ffmpeg binary — NO AI video clip provider, NO ElevenLabs, NO npm encoder
 * dependency, NO new secrets. Each scene is a solid brand-color background
 * (lavfi `color`) with `drawtext` title + caption overlays (DejaVu fonts already
 * present in the environment); scenes are concatenated into a single H.264 file.
 *
 * SOVEREIGNTY NOTE: this is the ONE part of Phoenix that depends on a system
 * binary (ffmpeg) rather than pure JS. The renderer is therefore best-effort and
 * FAIL-SAFE: if ffmpeg is absent (e.g. a host without it) or any step fails, it
 * resolves to `null` (never throws) and Phoenix degrades to the grounded
 * storyboard + scene breakdown (the render manifest), which is fully portable and
 * re-renderable anywhere ffmpeg exists. Override the binary path with FFMPEG_PATH.
 */

const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const MAX_SCENES = 12;
const SCENE_TIMEOUT_MS = 60_000;
const CONCAT_TIMEOUT_MS = 120_000;

let cachedFfmpegPath: string | null | undefined;

/**
 * Resolve the ffmpeg binary cheaply (PATH scan + FFMPEG_PATH override), memoized.
 * Deliberately does NOT spawn a process — safe to call at module-load time for
 * provider status without paying a boot cost.
 */
export function ffmpegPath(): string | null {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;
  const override = process.env.FFMPEG_PATH?.trim();
  if (override && existsSync(override)) {
    cachedFfmpegPath = override;
    return cachedFfmpegPath;
  }
  const dirs = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of dirs) {
    const candidate = join(dir, "ffmpeg");
    if (existsSync(candidate)) {
      cachedFfmpegPath = candidate;
      return cachedFfmpegPath;
    }
  }
  cachedFfmpegPath = null;
  return cachedFfmpegPath;
}

/** True when a programmatic video renderer (ffmpeg) is available on this host. */
export function videoRendererAvailable(): boolean {
  return ffmpegPath() !== null;
}

export interface RenderedVideo {
  bytes: Buffer;
  mimeType: string;
  durationSec: number;
  width: number;
  height: number;
}

function dimensions(format: PhoenixVideoFormat): { w: number; h: number } {
  switch (format) {
    case "9:16":
      return { w: 720, h: 1280 };
    case "1:1":
      return { w: 720, h: 720 };
    case "16:9":
    default:
      return { w: 1280, h: 720 };
  }
}

/** Validate a 6-digit hex color (with/without leading #); fall back if invalid. */
function hexColor(value: string | undefined, fallback: string): string {
  const s = (value ?? "").replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars` each. */
function wrapText(text: string, maxChars: number, maxLines: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) current = word;
    else if (`${current} ${word}`.length <= maxChars) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines).join("\n");
}

function runFfmpeg(bin: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(bin, args, { stdio: ["ignore", "ignore", "ignore"] });
    } catch {
      finish(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(false);
    }, timeoutMs);
    proc.on("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      finish(code === 0);
    });
  });
}

/**
 * Render a storyboard to an MP4 for one format. Fail-safe: returns `null` on any
 * failure (missing ffmpeg, missing fonts, render/concat error, empty output).
 */
export async function renderStoryboardVideo(
  storyboard: PhoenixStoryboard,
  format: PhoenixVideoFormat,
): Promise<RenderedVideo | null> {
  const bin = ffmpegPath();
  if (!bin) return null;
  if (!existsSync(FONT_BOLD) || !existsSync(FONT_REGULAR)) return null;

  const scenes = storyboard.scenes.slice(0, MAX_SCENES);
  if (scenes.length === 0) return null;

  const { w, h } = dimensions(format);
  const minDim = Math.min(w, h);
  const titleFs = Math.round(minDim * 0.07);
  const captionFs = Math.round(minDim * 0.045);
  const titleMaxChars = Math.max(8, Math.round(w / (titleFs * 0.55)));
  const captionMaxChars = Math.max(10, Math.round(w / (captionFs * 0.55)));

  let work: string | null = null;
  try {
    work = mkdtempSync(join(tmpdir(), "phoenix-"));
    const sceneFiles: string[] = [];
    let total = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const dur = Math.min(10, Math.max(1, Math.round(scene.durationSec || 4)));
      const bg = hexColor(scene.bgColor, "000000");
      const fg = hexColor(scene.textColor, "FFFFFF");
      const titleTxt = wrapText(scene.title || "", titleMaxChars, 4);
      const captionTxt = wrapText(scene.caption || "", captionMaxChars, 5);

      const titlePath = join(work, `t${i}.txt`);
      const captionPath = join(work, `c${i}.txt`);
      writeFileSync(titlePath, titleTxt, "utf8");
      writeFileSync(captionPath, captionTxt, "utf8");

      const filters: string[] = [];
      if (titleTxt) {
        filters.push(
          `drawtext=fontfile=${FONT_BOLD}:textfile=${titlePath}:fontcolor=0x${fg}:fontsize=${titleFs}:x=(w-text_w)/2:y=h*0.28:line_spacing=12`,
        );
      }
      if (captionTxt) {
        filters.push(
          `drawtext=fontfile=${FONT_REGULAR}:textfile=${captionPath}:fontcolor=0x${fg}:fontsize=${captionFs}:x=(w-text_w)/2:y=h*0.60:line_spacing=8`,
        );
      }

      const sceneOut = join(work, `s${i}.mp4`);
      const args = [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x${bg}:s=${w}x${h}:d=${dur}:r=30`,
      ];
      if (filters.length > 0) {
        args.push("-vf", filters.join(","));
      }
      args.push(
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-t",
        String(dur),
        sceneOut,
      );

      const ok = await runFfmpeg(bin, args, SCENE_TIMEOUT_MS);
      if (!ok || !existsSync(sceneOut)) return null;
      sceneFiles.push(sceneOut);
      total += dur;
    }

    const listPath = join(work, "list.txt");
    writeFileSync(
      listPath,
      sceneFiles
        .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
        .join("\n"),
      "utf8",
    );

    const finalOut = join(work, "final.mp4");
    const concatArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-movflags",
      "+faststart",
      finalOut,
    ];
    const concatOk = await runFfmpeg(bin, concatArgs, CONCAT_TIMEOUT_MS);
    if (!concatOk || !existsSync(finalOut)) return null;

    const bytes = readFileSync(finalOut);
    if (bytes.length === 0) return null;

    return { bytes, mimeType: "video/mp4", durationSec: total, width: w, height: h };
  } catch {
    return null;
  } finally {
    if (work) {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}
