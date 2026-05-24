/**
 * useExchangeCatalog — single source of truth for exchange product metadata
 * across the trading-dashboard frontend. Hydrates `/api/exchanges/catalog`
 * and exposes both the array (preserved order) and a fast lookup map.
 *
 * R1.5 — replaces every hardcoded EXCHANGES array in this artifact.
 * Consumers (Settings.tsx preferred-exchange picker, CommandBar exchange
 * switcher, PortalExchangeConnectModal) must NOT re-define their own
 * exchange list — read from this hook instead.
 *
 * Returned shape mirrors `ExchangeCatalogEntry` from
 * `artifacts/api-server/src/services/exchanges/catalog.ts`. Optional
 * presentation overlay fields (sigil / brandColor / apiKeyGuide) are
 * surfaced for UI tile rendering.
 */

import { useQuery } from "@tanstack/react-query";

export interface CatalogEntry {
  id:                 string;
  name:               string;
  url?:               string;
  logo?:              string;
  requiresPassphrase: boolean;
  requiredPerms?:     string;
  warnings?:          string[];
  takerFeePct?:       number;
  makerFeePct?:       number;
  status:             "live" | "beta" | "coming_soon";
  features?:          string[];
  adapterAvailable:   boolean;
  customerVisible?:   boolean;
  adminOnly?:         boolean;
  comingSoonNote?:    string;
  sigil?:             string;
  brandColor?:        string;
  apiKeyGuide?:       string;
}

interface CatalogResponse { exchanges: CatalogEntry[] }

export function useExchangeCatalog() {
  const q = useQuery<CatalogResponse>({
    queryKey:  ["exchanges-catalog"],
    queryFn:   () => fetch("/api/exchanges/catalog").then(r => r.json()),
    staleTime: 60_000,
  });
  const exchanges = q.data?.exchanges ?? [];
  const byId      = Object.fromEntries(exchanges.map(e => [e.id, e])) as Record<string, CatalogEntry>;
  return {
    exchanges,
    byId,
    loading: q.isLoading,
    error:   q.error,
  };
}

/** Default UI sigil when catalog row omits one. */
export function sigilFor(entry: CatalogEntry | undefined): string {
  if (!entry) return "?";
  if (entry.sigil) return entry.sigil;
  return entry.name.charAt(0).toUpperCase();
}
