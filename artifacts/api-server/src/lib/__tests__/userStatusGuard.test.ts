import { describe, it, expect } from "vitest";
import { verdictFor } from "../userStatusGuard.js";

describe("userStatusGuard.verdictFor truth table", () => {
  it("active → everything allowed", () => {
    const v = verdictFor("active");
    expect(v.allowLive).toBe(true);
    expect(v.allowPaper).toBe(true);
    expect(v.allowAuth).toBe(true);
  });

  it("force_paper → blocks live, allows paper + auth", () => {
    const v = verdictFor("force_paper");
    expect(v.allowLive).toBe(false);
    expect(v.allowPaper).toBe(true);
    expect(v.allowAuth).toBe(true);
  });

  it("suspended → blocks paper + live, allows auth (so user can see reason)", () => {
    const v = verdictFor("suspended", "ToS violation");
    expect(v.allowLive).toBe(false);
    expect(v.allowPaper).toBe(false);
    expect(v.allowAuth).toBe(true);
    expect(v.reason).toBe("ToS violation");
  });

  it("disabled → hard lock; auth bootstrap blocked", () => {
    const v = verdictFor("disabled");
    expect(v.allowLive).toBe(false);
    expect(v.allowPaper).toBe(false);
    expect(v.allowAuth).toBe(false);
  });

  it("propagates the reason field unchanged", () => {
    const v = verdictFor("force_paper", "kraken-bridge cool-down");
    expect(v.reason).toBe("kraken-bridge cool-down");
  });
});
