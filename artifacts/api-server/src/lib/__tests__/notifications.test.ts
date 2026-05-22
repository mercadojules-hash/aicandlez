import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendOperatorAlert } from "../notifications.js";

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("sendOperatorAlert", () => {
  it("skips email delivery when transport env vars are missing", async () => {
    delete process.env["RESEND_API_KEY"];
    delete process.env["OPERATOR_ALERT_EMAIL_FROM"];
    delete process.env["OPERATOR_ALERT_EMAIL_TO"];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "should-not-be-called" }), { status: 200 }),
    );

    await sendOperatorAlert({
      subject:   "ignored",
      body:      "ignored",
      dedupeKey: "test:unconfigured",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delivers email via Resend HTTP API when fully configured (forced-failure scenario)", async () => {
    process.env["RESEND_API_KEY"]            = "re_test_key";
    process.env["OPERATOR_ALERT_EMAIL_FROM"] = "alerts@aicandlez.com";
    process.env["OPERATOR_ALERT_EMAIL_TO"]   = "oncall@aicandlez.com, backup@aicandlez.com";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_resend_123" }), { status: 200 }),
    );

    // Simulate the exact payload backfillScheduler.maybeAlertOperators would
    // send for a forced nightly-run failure, so this test doubles as a
    // proof that the backfill-scheduler source actually emits a delivered
    // email when something blows up off-hours.
    await sendOperatorAlert({
      subject:   "Nightly broker order-id back-fill FAILED",
      body:      "Trigger:  scheduled\nError:    forced failure for test",
      dedupeKey: "backfill-scheduler:error:forced failure for test",
      context:   {
        source:  "backfill-scheduler",
        trigger: "scheduled",
        ok:      false,
        error:   "forced failure for test",
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer re_test_key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(init?.body));
    expect(body.from).toBe("alerts@aicandlez.com");
    expect(body.to).toEqual(["oncall@aicandlez.com", "backup@aicandlez.com"]);
    expect(body.subject).toBe("Nightly broker order-id back-fill FAILED");
    expect(body.text).toContain("forced failure for test");
    expect(body.headers["X-Entity-Ref-ID"]).toBe(
      "backfill-scheduler:error:forced failure for test",
    );
  });

  it("does not throw when Resend returns a non-2xx response", async () => {
    process.env["RESEND_API_KEY"]            = "re_test_key";
    process.env["OPERATOR_ALERT_EMAIL_FROM"] = "alerts@aicandlez.com";
    process.env["OPERATOR_ALERT_EMAIL_TO"]   = "oncall@aicandlez.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );

    await expect(
      sendOperatorAlert({
        subject:   "x",
        body:      "y",
        dedupeKey: "test:transport-failure",
      }),
    ).resolves.toBeUndefined();
  });

  it("ignores empty / whitespace-only entries in OPERATOR_ALERT_EMAIL_TO", async () => {
    process.env["RESEND_API_KEY"]            = "re_test_key";
    process.env["OPERATOR_ALERT_EMAIL_FROM"] = "alerts@aicandlez.com";
    process.env["OPERATOR_ALERT_EMAIL_TO"]   = "  ,  ,  ";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    await sendOperatorAlert({
      subject:   "x",
      body:      "y",
      dedupeKey: "test:empty-to",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
