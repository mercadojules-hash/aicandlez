import { describe, it, expect } from "vitest";
import { resolveAppUrls } from "../appUrls";

describe("resolveAppUrls — Task #162 landing CTA host wiring", () => {
  it("defaults to the production trade + app hosts when env is empty", () => {
    const u = resolveAppUrls({});
    expect(u.APP_HOME_URL).toBe("https://app.aicandlez.com");
    expect(u.TRADE_HOME_URL).toBe("https://trade.aicandlez.com");
    expect(u.TRADE_PORTAL_URL).toBe("https://trade.aicandlez.com/portal");
    expect(u.TRADE_SIGN_IN_URL).toBe("https://trade.aicandlez.com/sign-in");
    expect(u.TRADE_SIGN_UP_URL).toBe("https://trade.aicandlez.com/sign-up");
  });

  it("primary CTA target is the customer DESKTOP portal, not the PWA — prevents the legacy double-bounce", () => {
    const u = resolveAppUrls({});
    expect(u.TRADE_HOME_URL).not.toContain("app.aicandlez.com");
    expect(u.TRADE_HOME_URL).toContain("trade.aicandlez.com");
  });

  it("normalizes trailing slashes on both env-provided origins", () => {
    const u = resolveAppUrls({
      VITE_APP_URL:   "https://app.example.test/",
      VITE_TRADE_URL: "https://trade.example.test///",
    });
    expect(u.APP_HOME_URL).toBe("https://app.example.test");
    expect(u.TRADE_HOME_URL).toBe("https://trade.example.test");
    expect(u.TRADE_SIGN_IN_URL).toBe("https://trade.example.test/sign-in");
  });

  it("honors env overrides for staging hosts", () => {
    const u = resolveAppUrls({
      VITE_APP_URL:   "https://staging-app.aicandlez.com",
      VITE_TRADE_URL: "https://staging-trade.aicandlez.com",
    });
    expect(u.TRADE_PORTAL_URL).toBe("https://staging-trade.aicandlez.com/portal");
    expect(u.APP_HOME_URL).toBe("https://staging-app.aicandlez.com");
  });
});
