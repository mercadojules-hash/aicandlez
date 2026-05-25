/**
 * Shared scaffolding for customer-surface portal modals.
 *
 * Extracted from `pages/portal/AdminPortalLegacy.tsx` as part of Phase E3 so
 * the customer shell (`components/portal/PortalCustomerShell.tsx`) no longer
 * cross-imports from the admin module — that import direction violated the
 * customer↔admin separation invariant documented in `replit.md`.
 *
 * Admin path remains byte-identical: AdminPortalLegacy retains its own local
 * copies of these components and still imports `N` directly from the shared
 * institutional theme. Only the customer surface routes through this barrel.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import type { ReactNode } from "react";

import { N } from "@/components/command/institutional/theme";
import { authFetch } from "@/lib/authFetch";
import {
  ALERT_DEFINITIONS,
  ALERT_KEYS,
  type AlertKey,
  type AlertPrefs,
} from "@workspace/db/schema";
import { toast } from "@/hooks/use-toast";

export { N };
export type Plan = "free" | "starter" | "pro";

const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
export const apiBaseUrl = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  basePath ??
  ""
).replace(/\/$/, "");

/* ── Generic portal-styled modal shell ─────────────────────────────────── */

export function PortalModal({
  open, onClose, eyebrow, title, children, maxWidth = 500,
}: {
  open:      boolean;
  onClose:   () => void;
  eyebrow:   string;
  title:     string;
  maxWidth?: number;
  children:  ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth, width: "100%",
          background: N.SURFACE_1,
          border: `1px solid ${N.BRAND_DIM}`,
          borderRadius: 8,
          padding: 28,
          fontFamily: N.FONT_MONO,
          boxShadow: `0 0 40px ${N.BRAND_GLOW}, inset 0 0 40px ${N.BRAND}10`,
          position: "relative", overflow: "hidden",
          maxHeight: "calc(100dvh - 48px)", overflowY: "auto",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${N.BRAND}, transparent)`,
        }} />

        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.22em",
          color: N.BRAND, textShadow: `0 0 8px ${N.BRAND_GLOW}`,
          marginBottom: 8,
        }}>{eyebrow}</div>
        <h3 style={{
          fontSize: 22, color: N.TEXT_0, fontWeight: 800,
          margin: "4px 0 14px", lineHeight: 1.2,
        }}>{title}</h3>

        {children}

        <button
          onClick={onClose}
          style={{
            display: "block", margin: "14px auto 0",
            background: "transparent", border: "none",
            color: N.TEXT_2, fontSize: 10, letterSpacing: "0.18em",
            fontFamily: N.FONT_MONO, cursor: "pointer",
          }}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

/* ── AccountRow + AlertToggleRow primitives ────────────────────────────── */

export function AccountRow({ label, value, sub, color = N.TEXT_0 }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: 12,
      padding: "10px 12px",
      background: N.SURFACE_2,
      border: `1px solid ${N.BORDER}`,
      borderRadius: 4,
    }}>
      <div style={{
        fontSize: 9, color: N.TEXT_2, letterSpacing: "0.18em", fontWeight: 700,
        paddingTop: 2,
      }}>{label}</div>
      <div style={{ textAlign: "right", maxWidth: "65%" }}>
        <div style={{
          fontSize: 12, color, fontWeight: 700,
          textShadow: color !== N.TEXT_0 ? `0 0 6px ${color}40` : "none",
        }}>{value}</div>
        {sub && (
          <div style={{ fontSize: 9, color: N.TEXT_2, marginTop: 2, lineHeight: 1.4 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export function AlertToggleRow({ label, sub, value, loading, onChange }: {
  label:    string;
  sub?:     string;
  value:    boolean;
  loading?: boolean;
  onChange: (next: boolean) => void;
}) {
  const track = value ? `${N.BRAND}55` : "rgba(255,255,255,0.10)";
  const knob  = value ? N.BRAND : N.TEXT_2;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 12,
      padding: "10px 12px",
      background: N.SURFACE_2,
      border: `1px solid ${N.BORDER}`,
      borderRadius: 4,
      opacity: loading ? 0.7 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 9, color: N.TEXT_2, letterSpacing: "0.18em", fontWeight: 700,
        }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 10, color: N.TEXT_1, marginTop: 4, lineHeight: 1.4 }}>
            {sub}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={loading}
        onClick={() => onChange(!value)}
        style={{
          flexShrink: 0,
          position: "relative",
          width: 40, height: 22,
          background: track,
          border: `1px solid ${value ? N.BRAND : N.BORDER_HI}`,
          borderRadius: 999,
          cursor: loading ? "wait" : "pointer",
          boxShadow: value ? `0 0 10px ${N.BRAND_GLOW}` : "none",
          transition: "background 160ms ease, box-shadow 160ms ease",
          padding: 0,
        }}>
        <span style={{
          position: "absolute", top: 2, left: value ? 20 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: knob,
          transition: "left 160ms ease, background 160ms ease",
          boxShadow: value ? `0 0 6px ${N.BRAND_GLOW}` : "none",
        }} />
      </button>
    </div>
  );
}

/* ── Alert preferences panel (full ALERT_DEFINITIONS taxonomy) ─────────── */

export function AlertPreferencesPanel({
  loading, pendingKey, resolve, onToggle,
}: {
  loading:    boolean;
  pendingKey: AlertKey | null;
  resolve:    (key: AlertKey) => boolean;
  onToggle:   (key: AlertKey, next: boolean) => void;
}) {
  // Sanity guard — surface a typecheck failure if the shared taxonomy drifts.
  void ALERT_KEYS;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 9, color: N.TEXT_2, letterSpacing: "0.22em", fontWeight: 700,
        padding: "0 2px 8px",
      }}>
        NOTIFICATION PREFERENCES
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        opacity: loading ? 0.55 : 1,
      }}>
        {ALERT_DEFINITIONS.map((d) => (
          <AlertToggleRow
            key={d.key}
            label={d.label.toUpperCase()}
            sub={d.sub}
            value={resolve(d.key)}
            loading={loading || pendingKey === d.key}
            onChange={(next) => onToggle(d.key, next)}
          />
        ))}
      </div>
      <div style={{
        marginTop: 8, padding: "8px 10px",
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${N.BORDER}`,
        borderRadius: 4,
        fontSize: 9, color: N.TEXT_2, lineHeight: 1.5,
        letterSpacing: "0.04em",
      }}>
        Preferences sync with the mobile app · Server-side push dispatcher honors every toggle before sending.
      </div>
    </div>
  );
}

/* ── useAlertPreferences — server-authoritative alertPrefs hook ────────── */
// Extracted from the legacy AccountModal so the new customer-surface modal
// stays focused on layout. Keeps the same `["/api/user/settings"]` query key
// the PWA + admin modal use → cross-surface cache invalidation continues to
// work unchanged.

type UserSettingsPayload = {
  alertPrefs?:             AlertPrefs;
  notificationsLiveFills?: boolean;
};

export function useAlertPreferences(enabled: boolean) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery<UserSettingsPayload>({
    queryKey: ["/api/user/settings"],
    enabled,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Defensive: never throw on settings load. A 500 / network blip
      // during portal bootstrap previously cascaded into a render crash
      // ("Cannot read properties of null"). Falling back to {} lets
      // resolveAlert() use per-key defaultOn and keeps the portal alive.
      try {
        const token = await getToken().catch(() => null);
        const res = await authFetch(`${apiBaseUrl}/api/user/settings`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return {};
        return await res.json();
      } catch {
        return {};
      }
    },
  });

  const resolveAlert = (key: AlertKey): boolean => {
    const stored = settingsQuery.data?.alertPrefs?.[key];
    if (typeof stored === "boolean") return stored;
    if (key === "liveTradeFilled"
        && typeof settingsQuery.data?.notificationsLiveFills === "boolean") {
      return settingsQuery.data.notificationsLiveFills;
    }
    return ALERT_DEFINITIONS.find((d) => d.key === key)?.defaultOn ?? true;
  };

  const alertPrefMutation = useMutation({
    mutationFn: async (patch: { key: AlertKey; value: boolean }) => {
      const token = await getToken().catch(() => null);
      const body: Record<string, unknown> = {
        alertPrefs: { [patch.key]: patch.value },
      };
      if (patch.key === "liveTradeFilled") body.notificationsLiveFills = patch.value;
      const res = await authFetch(`${apiBaseUrl}/api/user/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onMutate: async (patch: { key: AlertKey; value: boolean }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/user/settings"] });
      const prev = queryClient.getQueryData<UserSettingsPayload>(["/api/user/settings"]);
      const nextPrefs: AlertPrefs = { ...(prev?.alertPrefs ?? {}), [patch.key]: patch.value };
      const nextLegacy = patch.key === "liveTradeFilled"
        ? patch.value
        : prev?.notificationsLiveFills;
      queryClient.setQueryData<UserSettingsPayload>(["/api/user/settings"], {
        ...(prev ?? {}),
        alertPrefs: nextPrefs,
        notificationsLiveFills: nextLegacy,
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/user/settings"], ctx.prev);
      toast({ title: "Could not save preference", description: "Please try again." });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
    },
  });

  const pendingKey: AlertKey | null = alertPrefMutation.isPending
    ? (alertPrefMutation.variables?.key ?? null)
    : null;

  return {
    loading: settingsQuery.isLoading,
    pendingKey,
    resolveAlert,
    setAlertPref: (key: AlertKey, value: boolean) =>
      alertPrefMutation.mutate({ key, value }),
  };
}
