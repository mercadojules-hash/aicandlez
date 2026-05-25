import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SimTrade } from "@/lib/api";

const SANS = "Inter, 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const BRAND_GLOW  = "rgba(102,255,102,0.45)";

const BG        = "#000000";
const SURFACE   = "#0A1410";
const SURFACE_2 = "#0F1F18";
const BORDER    = "rgba(255,255,255,0.08)";
const BORDER_HI = "rgba(102,255,102,0.22)";

const TEXT     = "#F2FFF6";
const TEXT_SUB = "#B4D9C0";
const TEXT_DIM = "#6F8C7A";

const POS = BRAND;
const NEG = "#FF4060";

// Map exchange slug → user-facing label + order-history URL.
// Used to deep-link the broker's own confirmation/history view.
// OKX / KuCoin / Bybit / Robinhood deliberately omitted — see
// artifacts/api-server/src/services/exchanges/catalog.ts header comment.
const EXCHANGE_META: Record<string, { label: string; url?: string }> = {
  alpaca:    { label: "Alpaca",         url: "https://app.alpaca.markets/brokerage/dashboard/orders" },
  kraken:    { label: "Kraken",         url: "https://www.kraken.com/u/history/trades" },
  coinbase:  { label: "Coinbase",       url: "https://accounts.coinbase.com/profile" },
  cryptocom: { label: "Crypto.com",     url: "https://crypto.com/exchange/trade/spot" },
  binance:   { label: "Binance",        url: "https://www.binance.com/en/my/orders/exchange/tradeorder" },
};

function exchangeMeta(raw?: string) {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  return EXCHANGE_META[key] ?? { label: raw, url: undefined };
}

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

function fmtTimestamp(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
    hour12: true,
  });
}

export interface TradeDetailSheetProps {
  trade: SimTrade | null;
  onClose: () => void;
}

export function TradeDetailSheet({ trade, onClose }: TradeDetailSheetProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Trigger slide-in after mount
  useEffect(() => {
    if (!trade) {
      setMounted(false);
      setCopied(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [trade]);

  // Lock body scroll while open
  useEffect(() => {
    if (!trade) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [trade]);

  // ESC to dismiss
  useEffect(() => {
    if (!trade) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trade, onClose]);

  if (!trade) return null;

  const isWin    = (trade.pnl ?? 0) >= 0;
  const sideRaw  = (trade.side ?? "").toLowerCase();
  const isLong   = sideRaw === "long" || sideRaw === "buy";
  const accent   = isWin ? POS : NEG;
  const broker   = exchangeMeta(trade.exchange);
  const isLive   = !!broker;
  const orderId  = trade.exchangeOrderId ?? "";
  const symLabel = trade.symbol.replace("USD", "") + (isLive ? "" : "/USDT");

  const onCopy = async () => {
    if (!orderId) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const sheet = (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Trade receipt"
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: mounted ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        transition: "background 0.22s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: `
            radial-gradient(circle at 0% 0%, rgba(102,255,102,0.08) 0%, transparent 55%),
            linear-gradient(160deg, ${SURFACE_2} 0%, ${SURFACE} 60%, ${BG} 100%)
          `,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          border: `1px solid ${BORDER_HI}`,
          borderBottom: "none",
          boxShadow: `0 -24px 60px rgba(0,0,0,0.36), 0 0 0 1px rgba(102,255,102,0.048) inset`,
          padding: "10px 18px 28px",
          maxHeight: "92vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          transform: mounted ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
          fontFamily: SANS,
        }}
      >
        {/* Grab handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 999,
          background: "rgba(255,255,255,0.16)",
          margin: "4px auto 14px",
        }}/>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{
              fontSize: 9, fontWeight: 700, color: TEXT_DIM,
              letterSpacing: 1.2, textTransform: "uppercase",
            }}>
              {isLive ? "Broker Receipt" : "Paper Trade Receipt"}
            </div>
            <div style={{
              fontSize: 20, fontWeight: 800, color: TEXT,
              letterSpacing: -0.3, marginTop: 2,
            }}>
              {symLabel}
              <span style={{
                marginLeft: 8,
                padding: "3px 8px", borderRadius: 4,
                background: isLong ? `${BRAND}1F` : `${NEG}1F`,
                border: `1px solid ${isLong ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
                fontSize: 9.5, fontWeight: 800,
                color: isLong ? BRAND : NEG,
                letterSpacing: 0.8, textTransform: "uppercase",
                verticalAlign: "middle",
              }}>{isLong ? "Buy / Long" : "Sell / Short"}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              color: TEXT_SUB, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, lineHeight: 1, padding: 0,
            }}
          >×</button>
        </div>

        {/* Realized PnL hero */}
        <div style={{
          padding: "14px 16px", borderRadius: 16, marginBottom: 14,
          background: `linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 100%)`,
          border: `1px solid ${isWin ? BORDER_HI : "rgba(255,64,96,0.28)"}`,
          boxShadow: `0 0 22px -10px ${isWin ? BRAND_GLOW : "rgba(255,64,96,0.21)"}`,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: TEXT_DIM,
            letterSpacing: 1.2, textTransform: "uppercase",
          }}>Realized P&amp;L</div>
          <div style={{
            fontSize: 30, fontWeight: 800, color: accent,
            letterSpacing: -0.8, fontVariantNumeric: "tabular-nums",
            marginTop: 2,
            textShadow: `0 0 18px ${isWin ? "rgba(102,255,102,0.21)" : "rgba(255,64,96,0.18)"}`,
          }}>
            {(trade.pnl ?? 0) >= 0 ? "+" : ""}${Math.abs(trade.pnl ?? 0).toFixed(2)}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, color: accent,
            marginTop: 2, fontVariantNumeric: "tabular-nums",
          }}>
            {(trade.pnlPct ?? 0) >= 0 ? "+" : ""}{(trade.pnlPct ?? 0).toFixed(2)}%
          </div>
        </div>

        {/* Fill detail */}
        <SectionLabel>Fills</SectionLabel>
        <Row label="Entry price" value={fmtPx(trade.entryPrice)} mono/>
        <Row label="Exit price"  value={fmtPx(trade.exitPrice)} mono accent={accent}/>
        {typeof trade.score === "number" && (
          <Row label="AI confidence" value={`${Math.round(trade.score)} / 100`} accent={BRAND}/>
        )}
        <Row label="Closed at" value={fmtTimestamp(trade.closedAt)}/>

        {/* Fees — live trades only. Paper trades hide this section entirely. */}
        {isLive && (() => {
          // Prefer the broker-reported commission when the exchange surfaced
          // one — it matches the customer's exchange statement to the cent
          // (maker discounts, tiered volume, stablecoin pair rates, etc).
          // Fall back to the catalog estimate when the broker didn't return
          // a per-order fee figure (e.g. Alpaca, Coinbase, Kraken pre-poll).
          // Match the server: broker fee is only the source of truth for
          // USD cash math when the broker charged in a USD-stable asset.
          // Native-asset fees (BNB, BTC, etc.) are still shown to the user
          // verbatim, but the USD totals fall back to the catalog estimate
          // so receipt math matches account equity.
          const USD_STABLE = new Set([
            "USD","USDT","USDC","BUSD","DAI","TUSD","USDP","FDUSD","ZUSD",
          ]);
          const entryEstimate = trade.entryFee;
          const exitEstimate  = trade.exitFee;
          const entryBroker   = trade.entryFeeBroker;
          const exitBroker    = trade.exitFeeBroker;
          const entryBrokerCcy = trade.entryFeeBrokerCurrency;
          const exitBrokerCcy  = trade.exitFeeBrokerCurrency;
          const entryFromBroker = typeof entryBroker === "number";
          const exitFromBroker  = typeof exitBroker  === "number";
          const entryBrokerIsUsd = entryFromBroker
            && (!entryBrokerCcy || USD_STABLE.has(entryBrokerCcy.toUpperCase()));
          const exitBrokerIsUsd  = exitFromBroker
            && (!exitBrokerCcy  || USD_STABLE.has(exitBrokerCcy.toUpperCase()));
          // Per-leg display value (native unit when broker reported it,
          // otherwise USD estimate). USD totals use the USD-equivalent only.
          const fmtFee = (
            broker: number | undefined,
            currency: string | undefined,
            estimate: number | undefined,
          ) => {
            if (typeof broker === "number") {
              const isUsd = !currency || USD_STABLE.has(currency.toUpperCase());
              if (isUsd) return `$${broker.toFixed(2)}`;
              const dp = broker < 1 ? 6 : 4;
              return `${broker.toFixed(dp)} ${currency}`;
            }
            return typeof estimate === "number" ? `$${estimate.toFixed(2)}` : "—";
          };
          const usdEntry = entryBrokerIsUsd ? entryBroker! : (entryEstimate ?? 0);
          const usdExit  = exitBrokerIsUsd  ? exitBroker!  : (exitEstimate  ?? 0);
          const haveAny = typeof entryEstimate === "number"
            || typeof exitEstimate === "number"
            || entryFromBroker || exitFromBroker;
          const totalFee = usdEntry + usdExit;
          const gross    = trade.pnl ?? 0;
          const net      = gross - totalFee;
          const grossStr = `${gross >= 0 ? "+" : "−"}$${Math.abs(gross).toFixed(2)}`;
          const netStr   = `${net   >= 0 ? "+" : "−"}$${Math.abs(net).toFixed(2)}`;
          const feeLabel = (
            base: string,
            isBroker: boolean,
            currency: string | undefined,
          ) => {
            if (!isBroker) return `${base} (est.)`;
            return currency && !USD_STABLE.has(currency.toUpperCase())
              ? `${base} · charged by broker (${currency})`
              : `${base} · charged by broker`;
          };
          return (
            <>
              <SectionLabel>Fees</SectionLabel>
              <Row
                label={feeLabel("Opening commission", entryFromBroker, entryBrokerCcy)}
                value={fmtFee(entryBroker, entryBrokerCcy, entryEstimate)}
                mono
              />
              <Row
                label={feeLabel("Closing commission", exitFromBroker, exitBrokerCcy)}
                value={fmtFee(exitBroker, exitBrokerCcy, exitEstimate)}
                mono
              />
              {haveAny && (
                <>
                  <Row
                    label="Total broker fees"
                    value={`−$${totalFee.toFixed(2)}`}
                    mono
                    accent={NEG}
                  />
                  <Row label="Gross P&L"          value={grossStr} mono accent={gross >= 0 ? POS : NEG}/>
                  <Row label="Net P&L after fees" value={netStr}   mono accent={net   >= 0 ? POS : NEG}/>
                </>
              )}
            </>
          );
        })()}

        {/* Broker section — live only */}
        {isLive ? (
          <>
            <SectionLabel>Broker</SectionLabel>
            <Row label="Exchange" value={broker!.label} accent={BRAND}/>
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: "10px 12px", borderRadius: 12, marginBottom: 8,
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${BORDER}`,
            }}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: TEXT_DIM,
                letterSpacing: 1.2, textTransform: "uppercase",
              }}>Opening order ID</div>
              {orderId ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code style={{
                    flex: 1, minWidth: 0,
                    fontFamily: MONO, fontSize: 12, color: TEXT,
                    background: "rgba(0,0,0,0.4)",
                    padding: "6px 8px", borderRadius: 6,
                    border: `1px solid ${BORDER}`,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{orderId}</code>
                  <button
                    onClick={onCopy}
                    aria-label="Copy order ID"
                    style={{
                      flexShrink: 0,
                      padding: "6px 12px", borderRadius: 8,
                      background: copied ? `${BRAND}26` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${copied ? BORDER_HI : BORDER}`,
                      color: copied ? BRAND : TEXT_SUB,
                      fontFamily: SANS, fontSize: 11, fontWeight: 700,
                      letterSpacing: 0.4, textTransform: "uppercase",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >{copied ? "Copied" : "Copy"}</button>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: TEXT_DIM }}>
                  Order ID not recorded for this fill.
                </div>
              )}
            </div>

            {broker!.url && (
              <a
                href={broker!.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block", textAlign: "center",
                  padding: "12px 14px", borderRadius: 12, marginTop: 4,
                  background: `linear-gradient(135deg, ${BRAND_DEEP}, ${BRAND})`,
                  color: "#06120A",
                  fontWeight: 800, fontSize: 13,
                  letterSpacing: 0.4, textTransform: "uppercase",
                  textDecoration: "none",
                  boxShadow: `0 0 22px -6px ${BRAND_GLOW}`,
                  border: `1px solid ${BRAND}`,
                }}
              >
                View on {broker!.label} ↗
              </a>
            )}
          </>
        ) : (
          <>
            <SectionLabel>Execution</SectionLabel>
            <div style={{
              padding: "12px 14px", borderRadius: 12,
              background: "rgba(255,255,255,0.02)",
              border: `1px dashed ${BORDER}`,
              fontSize: 12, color: TEXT_SUB, lineHeight: 1.5,
            }}>
              This trade ran in <strong style={{ color: TEXT }}>paper simulation</strong> —
              no broker order was placed and no real funds were used.
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: TEXT_DIM,
      letterSpacing: 1.2, textTransform: "uppercase",
      margin: "14px 2px 8px",
    }}>{children}</div>
  );
}

function Row({ label, value, mono, accent }: {
  label: string; value: string; mono?: boolean; accent?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 12px", borderRadius: 10, marginBottom: 6,
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${BORDER}`,
    }}>
      <span style={{
        fontSize: 11, fontFamily: SANS, fontWeight: 600,
        color: TEXT_DIM, letterSpacing: 0.4,
      }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700,
        fontFamily: mono ? MONO : SANS,
        color: accent ?? TEXT,
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
      }}>{value}</span>
    </div>
  );
}
