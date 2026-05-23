import { describe, it, expect } from "vitest";
import { resolveCustomerAppBaseUrl } from "../customerAppUrl";

describe("resolveCustomerAppBaseUrl — Task #162 Stripe return URL derivation", () => {
  describe("Origin header (preferred)", () => {
    it("honors app.aicandlez.com when present in Origin", () => {
      expect(
        resolveCustomerAppBaseUrl("https://app.aicandlez.com", {}),
      ).toBe("https://app.aicandlez.com");
    });

    it("honors trade.aicandlez.com when present in Origin", () => {
      expect(
        resolveCustomerAppBaseUrl("https://trade.aicandlez.com", {}),
      ).toBe("https://trade.aicandlez.com");
    });

    it("strips trailing slashes on the Origin", () => {
      expect(
        resolveCustomerAppBaseUrl("https://app.aicandlez.com/", {}),
      ).toBe("https://app.aicandlez.com");
    });

    it("accepts Replit preview hosts (*.replit.app / *.replit.dev)", () => {
      expect(
        resolveCustomerAppBaseUrl("https://my-preview-1234.replit.app", {}),
      ).toBe("https://my-preview-1234.replit.app");
      expect(
        resolveCustomerAppBaseUrl("https://abc.def.replit.dev", {}),
      ).toBe("https://abc.def.replit.dev");
    });

    it("accepts localhost for dev", () => {
      expect(
        resolveCustomerAppBaseUrl("http://localhost:80", {}),
      ).toBe("http://localhost:80");
    });

    it("REJECTS unknown origins and falls back to env (defense in depth — no open redirect via spoofed Origin)", () => {
      expect(
        resolveCustomerAppBaseUrl("https://evil.example.com", {
          CUSTOMER_APP_BASE_URL: "https://app.aicandlez.com",
        }),
      ).toBe("https://app.aicandlez.com");
    });
  });

  describe("env fallback chain", () => {
    it("prefers CUSTOMER_APP_BASE_URL when Origin missing", () => {
      expect(
        resolveCustomerAppBaseUrl(undefined, {
          CUSTOMER_APP_BASE_URL: "https://app.aicandlez.com",
          WEBHOOK_BASE_URL: "https://api.aicandlez.com",
        }),
      ).toBe("https://app.aicandlez.com");
    });

    it("falls back to WEBHOOK_BASE_URL when CUSTOMER_APP_BASE_URL absent", () => {
      expect(
        resolveCustomerAppBaseUrl(undefined, {
          WEBHOOK_BASE_URL: "https://legacy.example.com",
        }),
      ).toBe("https://legacy.example.com");
    });

    it("falls back to REPLIT_DOMAINS first host when prior envs absent", () => {
      expect(
        resolveCustomerAppBaseUrl(undefined, {
          REPLIT_DOMAINS: "preview-abc.replit.app,extra.replit.app",
        }),
      ).toBe("https://preview-abc.replit.app");
    });

    it("ultimate fallback is localhost:80 (dev sanity)", () => {
      expect(resolveCustomerAppBaseUrl(undefined, {})).toBe("http://localhost:80");
    });

    it("trims trailing slashes from env-provided values", () => {
      expect(
        resolveCustomerAppBaseUrl(undefined, {
          CUSTOMER_APP_BASE_URL: "https://app.aicandlez.com///",
        }),
      ).toBe("https://app.aicandlez.com");
    });
  });
});
