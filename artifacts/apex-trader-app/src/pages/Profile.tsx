import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { api, type Portfolio, type Subscription } from "@/lib/api";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";
import { useAIAutoTrade } from "@/contexts/AIAutoTradeContext";
import { useUserProfile, type UserProfile } from "@/contexts/UserProfileContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ── Design tokens ────────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "#00ff88";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const GOLD = "#ffd200";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

// ── Helpers ──────────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.slice(0, 2) ?? "A").toUpperCase();
}

// ── Donut ─────────────────────────────────────────────────────────────────────────
function Donut({ value, color, label }: { value: number; color: string; label: string }) {
  const size = 74, sw = 5.5, r = (size - sw * 2) / 2, cx = size / 2;
  const circ = 2 * Math.PI * r, arc = (Math.min(value, 100) / 100) * circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw}/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ filter:`drop-shadow(0 0 5px ${color}60)`, transition:"stroke-dasharray 0.5s" }}/>
        <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,0.92)" fontSize="14" fontWeight="700" fontFamily={MONO}>{value}</text>
      </svg>
      <div style={{ fontSize:8, fontFamily:SANS, fontWeight:500, color:GR,
        letterSpacing:"0.11em", textTransform:"uppercase" as const, textAlign:"center" as const }}>{label}</div>
    </div>
  );
}

// ── Monthly chart ─────────────────────────────────────────────────────────────────
const MONTHS = ["NOV","DEC","JAN","FEB","MAR","APR","MAY"];
const PERF   = [-180,420,640,510,820,580,370];
const MAX_ABS = Math.max(...PERF.map(Math.abs));
function MonthlyChart() {
  return (
    <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:12, padding:"14px 16px" }}>
      <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:"rgba(255,255,255,0.45)",
        letterSpacing:"0.16em", marginBottom:14, textTransform:"uppercase" as const }}>
        Monthly AI Performance
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:76, marginBottom:8 }}>
        {PERF.map((v, i) => {
          const up = v >= 0, h = Math.max(4,(Math.abs(v)/MAX_ABS)*68);
          const col = up ? "rgba(0,210,100,0.80)" : "rgba(230,70,70,0.78)";
          const last = i === MONTHS.length - 1;
          return (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"flex-end", height:"100%" }}>
              <div style={{ width:"100%", height:h, borderRadius:"3px 3px 0 0",
                background:col, opacity:last?1:0.65,
                boxShadow:last?`0 0 8px ${col}60`:"none" }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        {MONTHS.map((m, i) => {
          const last = i === MONTHS.length - 1;
          return (
            <div key={m} style={{ flex:1, textAlign:"center" as const, fontSize:7, fontFamily:SANS,
              fontWeight:last?600:400,
              color:last?"rgba(255,255,255,0.75)":"rgba(136,146,164,0.75)" }}>{m}</div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────────
function StatCard({ value, label, color, sub }: { value:string; label:string; color:string; sub?:string }) {
  return (
    <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:12, padding:"16px 14px" }}>
      <div style={{ fontSize:23, fontFamily:MONO, fontWeight:700, color, marginBottom:sub?3:5, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:9, fontFamily:SANS, color:"rgba(136,146,164,0.85)", marginBottom:3 }}>{sub}</div>}
      <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:"rgba(136,146,164,0.80)",
        letterSpacing:"0.12em", textTransform:"uppercase" as const }}>{label}</div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────────
function SectionHead({ label, accent="rgba(255,255,255,0.30)" }: { label:string; accent?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <div style={{ width:2, height:14, background:accent, borderRadius:2, flexShrink:0 }}/>
      <span style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:"rgba(255,255,255,0.55)",
        letterSpacing:"0.18em", textTransform:"uppercase" as const }}>{label}</span>
    </div>
  );
}

// ── Editable text field ───────────────────────────────────────────────────────────
function EditField({ label, value, onChange, placeholder, type="text" }: {
  label:string; value:string; onChange:(v:string)=>void; placeholder?:string; type?:string;
}) {
  return (
    <div style={{ marginBottom:13 }}>
      <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:GR,
        letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:6 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.11)",
          borderRadius:10, padding:"11px 14px", color:W, fontFamily:SANS, fontSize:13,
          outline:"none", boxSizing:"border-box" as const,
          transition:"border-color 0.15s ease",
        }}
        onFocus={e => e.target.style.borderColor = "rgba(0,229,255,0.40)"}
        onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.11)"}
      />
    </div>
  );
}

// ── AI toggle (institutional) ─────────────────────────────────────────────────────
function AIToggle({ label, sub, value, onChange, divider=true }: {
  label:string; sub?:string; value:boolean; onChange:(v:boolean)=>void; divider?:boolean;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"13px 0",
      borderBottom:divider?"1px solid rgba(255,255,255,0.05)":"none" }}>
      <div style={{ flex:1, paddingRight:16 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>{label}</div>
        {sub && <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        flexShrink:0, cursor:"pointer",
        position:"relative", width:46, height:26, borderRadius:13,
        background:value?"rgba(0,229,255,0.15)":"rgba(255,255,255,0.05)",
        border:`1px solid ${value?"rgba(0,229,255,0.40)":"rgba(255,255,255,0.10)"}`,
        boxShadow:value?"0 0 14px rgba(0,229,255,0.22)":"none",
        transition:"all 0.25s ease",
      }}>
        <div style={{
          position:"absolute", top:3,
          left:value?"calc(100% - 22px)":"3px",
          width:18, height:18, borderRadius:"50%",
          background:value?C:"rgba(255,255,255,0.35)",
          boxShadow:value?"0 0 8px rgba(0,229,255,0.60)":"none",
          transition:"left 0.25s ease, background 0.25s ease, box-shadow 0.25s ease",
        }}/>
      </button>
    </div>
  );
}

// ── Stepper row ───────────────────────────────────────────────────────────────────
function StepperRow({ label, sub, value, min, max, onChange }: {
  label:string; sub?:string; value:number; min:number; max:number; onChange:(v:number)=>void;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ flex:1, paddingRight:16 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>{label}</div>
        {sub && <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>{sub}</div>}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <button onClick={() => onChange(Math.max(min, value-1))} style={{
          width:28, height:28, borderRadius:7, background:"rgba(255,255,255,0.04)",
          border:"1px solid rgba(255,255,255,0.10)", color:W, fontFamily:MONO, fontSize:14,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
        }}>−</button>
        <span style={{ fontSize:16, fontFamily:MONO, fontWeight:700, color:C,
          minWidth:22, textAlign:"center" as const }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value+1))} style={{
          width:28, height:28, borderRadius:7, background:"rgba(255,255,255,0.04)",
          border:"1px solid rgba(255,255,255,0.10)", color:W, fontFamily:MONO, fontSize:14,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
        }}>+</button>
      </div>
    </div>
  );
}

// ── Risk selector ─────────────────────────────────────────────────────────────────
type RiskLevel = UserProfile["riskLevel"];
function RiskSelector({ value, onChange }: { value:RiskLevel; onChange:(v:RiskLevel)=>void }) {
  const opts: { key:RiskLevel; label:string; color:string }[] = [
    { key:"low",        label:"LOW",  color:"rgba(0,255,136,0.85)" },
    { key:"balanced",   label:"BAL",  color:"rgba(0,229,255,0.85)" },
    { key:"aggressive", label:"HIGH", color:"rgba(255,148,0,0.85)" },
  ];
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ flex:1, paddingRight:16 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>Risk Level</div>
        <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>Position sizing and stop-loss thresholds</div>
      </div>
      <div style={{ display:"flex", gap:5, flexShrink:0 }}>
        {opts.map(o => (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            padding:"5px 9px",
            background:value===o.key?`${o.color.replace("0.85","0.12")}`:"rgba(255,255,255,0.03)",
            border:`1px solid ${value===o.key?o.color.replace("0.85","0.40"):"rgba(255,255,255,0.08)"}`,
            borderRadius:6, fontSize:8, fontFamily:SANS, fontWeight:700,
            color:value===o.key?o.color:GR, cursor:"pointer",
            letterSpacing:"0.06em", transition:"all 0.15s ease",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// ── AI Status card ────────────────────────────────────────────────────────────────
function AIStatusCard({ enabled, positions, maxPositions }: {
  enabled:boolean; positions:number; maxPositions:number;
}) {
  return (
    <div style={{
      position:"relative", overflow:"hidden",
      background:enabled
        ?"linear-gradient(160deg,#051a28 0%,#030f1c 100%)"
        :"linear-gradient(160deg,#0c0e20 0%,#080a1c 100%)",
      border:`1px solid ${enabled?"rgba(0,229,255,0.30)":"rgba(255,255,255,0.08)"}`,
      borderRadius:18, padding:"18px 16px",
      boxShadow:enabled
        ?"0 0 50px rgba(0,229,255,0.10),0 12px 40px rgba(0,0,0,0.95)"
        :"0 8px 32px rgba(0,0,0,0.90)",
      transition:"all 0.40s ease", marginBottom:18,
    }}>
      <div aria-hidden style={{
        position:"absolute", top:0, left:0, right:0, height:2,
        background:enabled
          ?"linear-gradient(90deg,transparent 5%,rgba(0,229,255,0.70) 35%,rgba(155,92,245,0.60) 65%,transparent 95%)"
          :"linear-gradient(90deg,transparent 5%,rgba(155,92,245,0.35) 45%,transparent 95%)",
      }}/>
      {enabled && (
        <div aria-hidden style={{
          position:"absolute", top:-60, right:-40, width:220, height:220, borderRadius:"50%",
          background:"radial-gradient(circle,rgba(0,229,255,0.07) 0%,transparent 65%)",
          pointerEvents:"none",
        }}/>
      )}
      <div style={{ position:"relative" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{
                width:8, height:8, borderRadius:"50%",
                background:enabled?C:GR,
                boxShadow:enabled?`0 0 12px ${C}80`:"none",
                animation:enabled?"dot-pulse 1.2s ease-in-out infinite":"none",
                transition:"all 0.30s ease",
              }}/>
              <span style={{ fontSize:7, fontFamily:SANS, fontWeight:700,
                color:enabled?"rgba(0,229,255,0.65)":GR,
                letterSpacing:"0.22em", textTransform:"uppercase" as const }}>
                {enabled?"AI Portfolio Manager Online":"AI Autopilot Standby"}
              </span>
            </div>
            <div style={{ fontSize:17, fontFamily:SANS, fontWeight:800, color:W, letterSpacing:"-0.02em" }}>
              {enabled?"Autonomous Mode Active":"AI Trading Disabled"}
            </div>
          </div>
          <div style={{
            padding:"5px 12px", borderRadius:20,
            background:enabled?"rgba(0,229,255,0.08)":"rgba(255,255,255,0.04)",
            border:`1px solid ${enabled?"rgba(0,229,255,0.25)":"rgba(255,255,255,0.10)"}`,
            fontSize:8, fontFamily:SANS, fontWeight:700,
            color:enabled?C:GR, letterSpacing:"0.08em",
          }}>{enabled?"ACTIVE":"OFF"}</div>
        </div>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 14px",
          background:enabled?"rgba(0,229,255,0.06)":"rgba(255,255,255,0.03)",
          border:`1px solid ${enabled?"rgba(0,229,255,0.14)":"rgba(255,255,255,0.06)"}`,
          borderRadius:10, marginBottom:12, transition:"all 0.30s ease",
        }}>
          <div>
            <div style={{ fontSize:7, fontFamily:SANS, color:DIM,
              letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:3 }}>AI Positions</div>
            <div style={{ fontSize:24, fontFamily:MONO, fontWeight:800,
              color:enabled?C:"rgba(255,255,255,0.40)", letterSpacing:"-0.02em",
              transition:"color 0.30s ease" }}>{positions}/{maxPositions}</div>
          </div>
          <div style={{ textAlign:"right" as const }}>
            <div style={{ fontSize:7, fontFamily:SANS, color:DIM,
              letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:3 }}>Status</div>
            <div style={{ fontSize:10, fontFamily:SANS, fontWeight:600,
              color:enabled?"rgba(0,255,136,0.85)":GR }}>
              {enabled?"Risk Engine Active":"Monitoring Paused"}
            </div>
            <div style={{ fontSize:9, fontFamily:SANS, color:DIM, marginTop:2 }}>
              {enabled?"124 assets monitored":"Enable on Markets tab"}
            </div>
          </div>
        </div>
        {enabled ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {[
              { label:"Assets Scanned", val:"124", color:C },
              { label:"MTF Confirmed",  val:"3",   color:G },
              { label:"Entry Threshold",val:"65%", color:"rgba(155,92,245,0.90)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.06)", borderRadius:9, padding:"9px 8px",
                textAlign:"center" as const }}>
                <div style={{ fontSize:16, fontFamily:MONO, fontWeight:800, color }}>{val}</div>
                <div style={{ fontSize:7, fontFamily:SANS, color:GR, letterSpacing:"0.06em", marginTop:3 }}>{label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize:9, fontFamily:SANS, color:GR, lineHeight:1.6,
            padding:"8px 12px", background:"rgba(255,255,255,0.02)",
            border:"1px solid rgba(255,255,255,0.05)", borderRadius:8 }}>
            Toggle "Let AI Trade For Me" on the Crypto or Equities tab to activate autonomous trading.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Branded exchange row ──────────────────────────────────────────────────────────
function ExchangeRow({ name, status, statusCol, icon, iconBg, iconBorder, iconColor }: {
  name:string; status:string; statusCol:string;
  icon:string; iconBg:string; iconBorder:string; iconColor:string;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{
          width:34, height:34, borderRadius:9, flexShrink:0,
          background:iconBg, border:`1px solid ${iconBorder}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:14, fontFamily:MONO, fontWeight:800, color:iconColor,
        }}>{icon}</div>
        <span style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>{name}</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ width:5, height:5, borderRadius:"50%", background:statusCol,
          boxShadow:`0 0 6px ${statusCol}80` }}/>
        <span style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:statusCol,
          letterSpacing:"0.06em" }}>{status}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { signOut }        = useClerk();
  const [, setLocation]    = useLocation();
  const { openOnboarding } = useBrokerConnection();
  const { enabled: aiEnabled, setEnabled: setAiEnabled } = useAIAutoTrade();
  const { profile, updateProfile } = useUserProfile();
  const pushNotifs = usePushNotifications();

  // Edit-mode state (draft)
  const [editing,      setEditing]      = useState(false);
  const [draftName,    setDraftName]    = useState("");
  const [draftUsername,setDraftUsername]= useState("");
  const [draftEmail,   setDraftEmail]   = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const { data: portfolio } = useQuery<Portfolio>({
    queryKey:  ["mobile-portfolio"],
    queryFn:   () => api.get("/mobile/portfolio"),
    staleTime: 30_000,
  });
  const { data: sub } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get("/billing/subscription"),
    staleTime: 60_000,
  });

  const tv       = portfolio?.totalValue ?? 103800;
  const plan     = sub?.plan ?? "free";

  const realized  = 3800;
  const fees      = +(realized * 0.03).toFixed(2);
  const netProfit = realized - fees;
  const winRate   = 63.2;

  function openEdit() {
    setDraftName(profile.name);
    setDraftUsername(profile.username);
    setDraftEmail(profile.email);
    setEditing(true);
  }
  function saveEdit() {
    updateProfile({
      name:     draftName.trim()     || profile.name,
      username: draftUsername.trim() || profile.username,
      email:    draftEmail.trim()    || profile.email,
    });
    setEditing(false);
  }
  function cancelEdit() { setEditing(false); }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      if (url) updateProfile({ avatarUrl: url });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const ini = initials(profile.name);

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:32 }}>

      {/* ── Identity card ──────────────────────────────────────────────────── */}
      <div style={{ margin:"16px 16px 14px", background:CARD, border:`1px solid ${E}`,
        borderRadius:16, padding:"20px 18px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom: editing ? 20 : 0 }}>
          {/* Avatar — click to upload */}
          <div style={{ position:"relative", flexShrink:0, cursor:"pointer" }}
               onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept="image/*"
              style={{ display:"none" }} onChange={handleAvatarFile}/>
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar"
                style={{ width:60, height:60, borderRadius:"50%",
                  border:"1.5px solid rgba(0,229,255,0.35)", objectFit:"cover" as const }}/>
            ) : (
              <div style={{
                width:60, height:60, borderRadius:"50%",
                background:"linear-gradient(135deg,rgba(0,229,255,0.12),rgba(155,92,245,0.12))",
                border:"1.5px solid rgba(0,229,255,0.35)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:19, fontFamily:MONO, fontWeight:700, color:C,
              }}>{ini}</div>
            )}
            {/* Camera badge */}
            <div style={{
              position:"absolute", bottom:0, right:0,
              width:20, height:20, borderRadius:"50%",
              background:"rgba(0,229,255,0.18)", border:"1.5px solid rgba(0,229,255,0.50)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:9,
            }}>📷</div>
            <div style={{ position:"absolute", bottom:20, right:-1,
              width:10, height:10, borderRadius:"50%",
              background:"rgba(0,210,100,0.90)", border:"2px solid #000",
              boxShadow:"0 0 8px rgba(0,210,100,0.60)" }}/>
          </div>

          {/* Name & badges */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
              <span style={{ fontSize:18, fontFamily:SANS, fontWeight:700, color:W,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                {profile.name}
              </span>
              <span style={{
                padding:"2px 9px", flexShrink:0,
                background:plan==="free"?"rgba(255,255,255,0.05)":"rgba(0,229,255,0.08)",
                border:`1px solid ${plan==="free"?"rgba(255,255,255,0.14)":"rgba(0,229,255,0.22)"}`,
                borderRadius:4, fontSize:8, fontFamily:SANS, fontWeight:600,
                color:plan==="free"?"rgba(136,146,164,0.90)":C,
                letterSpacing:"0.07em", textTransform:"uppercase" as const,
              }}>{plan==="free"?"Trial":"Active"}</span>
            </div>
            <div style={{ fontSize:11, fontFamily:SANS, color:"rgba(136,146,164,0.90)",
              marginBottom:3, overflow:"hidden", textOverflow:"ellipsis",
              whiteSpace:"nowrap" as const }}>
              @{profile.username} · {profile.email}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {aiEnabled && (
                <div style={{ display:"flex", alignItems:"center", gap:4,
                  padding:"2px 8px",
                  background:"rgba(0,229,255,0.07)", border:"1px solid rgba(0,229,255,0.20)",
                  borderRadius:4 }}>
                  <div style={{ width:4, height:4, borderRadius:"50%", background:C,
                    animation:"dot-pulse 1.2s ease-in-out infinite",
                    boxShadow:`0 0 6px ${C}80` }}/>
                  <span style={{ fontSize:7.5, fontFamily:SANS, fontWeight:700, color:C,
                    letterSpacing:"0.10em" }}>AI ACTIVE</span>
                </div>
              )}
              {!editing ? (
                <button onClick={openEdit} style={{
                  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.11)",
                  borderRadius:5, padding:"2px 10px", cursor:"pointer",
                  fontSize:8, fontFamily:SANS, fontWeight:600, color:GR,
                  letterSpacing:"0.08em",
                }}>EDIT</button>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Inline edit form ─────────────────────────────────────────────── */}
        {editing && (
          <div>
            <div style={{ height:1, background:"rgba(255,255,255,0.06)", marginBottom:18 }}/>
            <EditField label="Full Name"  value={draftName}     onChange={setDraftName}     placeholder="Your full name"/>
            <EditField label="Username"   value={draftUsername} onChange={setDraftUsername} placeholder="username"/>
            <EditField label="Email"      value={draftEmail}    onChange={setDraftEmail}    placeholder="email@example.com" type="email"/>
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={saveEdit} style={{
                flex:1, padding:"12px 0",
                background:"rgba(0,229,255,0.12)", border:"1px solid rgba(0,229,255,0.35)",
                borderRadius:10, color:C, fontFamily:SANS, fontSize:13, fontWeight:700,
                letterSpacing:"0.04em", cursor:"pointer",
              }}>Save Changes</button>
              <button onClick={cancelEdit} style={{
                flex:1, padding:"12px 0",
                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.10)",
                borderRadius:10, color:GR, fontFamily:SANS, fontSize:13, fontWeight:600,
                letterSpacing:"0.04em", cursor:"pointer",
              }}>Cancel</button>
            </div>
            <button onClick={() => alert("Password change is managed through your sign-in provider.")} style={{
              marginTop:10, width:"100%", padding:"11px 0",
              background:"transparent", border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:10, color:DIM, fontFamily:SANS, fontSize:12, fontWeight:500,
              cursor:"pointer",
            }}>Change Password →</button>
          </div>
        )}
      </div>

      <div style={{ padding:"0 16px" }}>

        {/* ── AI Status ────────────────────────────────────────────────────── */}
        <SectionHead label="AI Portfolio Manager" accent={C}/>
        <AIStatusCard enabled={aiEnabled} positions={0} maxPositions={profile.maxTrades}/>

        {/* ── Stats 2×2 ───────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
          <StatCard value={`$${(tv/1000).toFixed(1)}K`}        label="Equity"       color={C}/>
          <StatCard value={`+$${(realized/1000).toFixed(1)}K`} label="Realized"     color="rgba(0,210,100,0.88)"/>
          <StatCard value={`${winRate}%`}                       label="Win Rate"     color="rgba(0,210,100,0.88)" sub="4W · 1L"/>
          <StatCard value={`$${fees.toFixed(2)}`}               label="AI Fees (3%)" color={GOLD}/>
        </div>

        {/* ── Performance Intelligence ─────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Performance Intelligence" accent="rgba(155,92,245,0.65)"/>
          <MonthlyChart/>
          <div style={{ marginTop:10, background:CARD, border:`1px solid ${E}`,
            borderRadius:12, padding:"20px 8px",
            display:"grid", gridTemplateColumns:"1fr 1fr 1fr", alignItems:"start" }}>
            <Donut value={71} color="rgba(155,92,245,0.80)" label="AI Score"/>
            <Donut value={59} color="rgba(0,185,215,0.78)"  label="Consistency"/>
            <Donut value={57} color="rgba(0,200,100,0.76)"  label="Efficiency"/>
          </div>
          <div style={{ marginTop:10, background:CARD, border:`1px solid ${E}`,
            borderRadius:12, overflow:"hidden" }}>
            {[
              { label:"Best Performing Asset",   val:"NVDA · +18.4%",  color:"rgba(0,255,136,0.88)" },
              { label:"Avg Trade Duration",       val:"4h 22m",         color:"rgba(0,229,255,0.82)" },
              { label:"Total AI Trades Executed", val:"47",             color:W },
              { label:"Most Profitable Sector",   val:"Technology",     color:"rgba(155,92,245,0.85)" },
              { label:"Highest Confidence Trade",  val:"NVDA · 91%",    color:GOLD },
            ].map(({ label, val, color }, i, arr) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", padding:"12px 16px",
                borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.05)":"none" }}>
                <span style={{ fontSize:12, fontFamily:SANS, color:GR }}>{label}</span>
                <span style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:10, display:"flex", justifyContent:"space-between",
            alignItems:"center", padding:"14px 0", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:"rgba(255,255,255,0.88)" }}>
              Cumulative Return
            </span>
            <span style={{ fontSize:16, fontFamily:MONO, fontWeight:700, color:"rgba(0,210,100,0.88)" }}>
              +${netProfit.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Capital & Withdrawals ─────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Capital & Withdrawals" accent="rgba(255,200,0,0.65)"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16 }}>
            <div style={{ background:"rgba(255,148,0,0.07)", borderBottom:"1px solid rgba(255,148,0,0.15)",
              padding:"9px 16px", display:"flex", alignItems:"center", gap:8, borderRadius:"16px 16px 0 0" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"rgba(255,148,0,0.90)", flexShrink:0 }}/>
              <span style={{ fontSize:9, fontFamily:SANS, fontWeight:600,
                color:"rgba(255,148,0,0.85)", letterSpacing:"0.08em" }}>
                PAPER MODE — Simulated profits · Switch to Live to withdraw
              </span>
            </div>
            {[
              { label:"Capital Under AI Management", val:`$${tv.toLocaleString()}`,    color:C },
              { label:"Realized P&L (All Time)",     val:`+$${realized.toLocaleString()}`, color:"rgba(0,255,136,0.88)" },
              { label:"AI Performance Fees (3%)",     val:`–$${fees.toFixed(2)}`,      color:GOLD },
              { label:"Net Profit After Fees",        val:`+$${netProfit.toFixed(2)}`, color:"rgba(0,255,136,0.88)" },
            ].map(({ label, val, color }, i, arr) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", padding:"13px 16px",
                borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.05)":"none" }}>
                <span style={{ fontSize:12, fontFamily:SANS, color:GR }}>{label}</span>
                <span style={{ fontSize:14, fontFamily:MONO, fontWeight:700, color }}>{val}</span>
              </div>
            ))}
            <div style={{ padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
              <button onClick={() => setLocation("/billing")} style={{
                width:"100%", padding:"12px 0",
                background:"rgba(0,229,255,0.07)", border:"1px solid rgba(0,229,255,0.22)",
                borderRadius:10, color:C, fontFamily:SANS, fontSize:12, fontWeight:600,
                letterSpacing:"0.04em", cursor:"pointer",
              }}>Switch to Live Trading — Withdraw Real Profits →</button>
            </div>
          </div>
        </div>

        {/* ── AI Settings ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="AI Settings" accent="rgba(0,229,255,0.65)"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16, padding:"0 16px" }}>
            <AIToggle
              label="Autonomous Trading"
              sub="AI selects, enters and exits positions automatically"
              value={aiEnabled}
              onChange={setAiEnabled}
              divider={true}
            />
            <StepperRow
              label="Max Concurrent AI Trades"
              sub="AI will not open more than this many positions at once"
              value={profile.maxTrades} min={1} max={6}
              onChange={v => updateProfile({ maxTrades: v })}
            />
            <RiskSelector
              value={profile.riskLevel}
              onChange={v => updateProfile({ riskLevel: v })}
            />
            <AIToggle
              label="Stop Loss Protection"
              sub="AI enforces stop-loss on every position"
              value={profile.stopLoss}
              onChange={v => updateProfile({ stopLoss: v })}
            />
            <AIToggle
              label="AI Trade Notifications"
              sub="Push alerts on AI entries, exits and signals"
              value={profile.notifications}
              onChange={v => updateProfile({ notifications: v })}
            />
            <AIToggle
              label="Auto-Reinvest Profits"
              sub="Compound realized gains into new AI positions"
              value={profile.autoReinvest}
              onChange={v => updateProfile({ autoReinvest: v })}
            />
            <AIToggle
              label="Paper Trading Mode"
              sub="Simulate trades risk-free with virtual capital"
              value={profile.paperMode}
              onChange={v => updateProfile({ paperMode: v })}
              divider={false}
            />
          </div>
          <div style={{ marginTop:8, padding:"9px 14px",
            background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.10)",
            borderRadius:8, fontSize:8.5, fontFamily:SANS, color:"rgba(0,229,255,0.60)", lineHeight:1.55 }}>
            ⚡ All settings persist across sessions. Paper mode is never a restriction on AI scanning.
          </div>
        </div>

        {/* ── Connected Accounts ───────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Connected Accounts" accent="rgba(0,255,136,0.55)"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16, overflow:"hidden" }}>
            <ExchangeRow
              name="Alpaca" status="PAPER · CONNECTED" statusCol="rgba(0,225,120,0.85)"
              icon="K"
              iconBg="rgba(130,80,220,0.13)" iconBorder="rgba(130,80,220,0.35)" iconColor="rgba(160,100,255,0.90)"
            />
            <ExchangeRow
              name="Alpaca" status="PAPER · CONNECTED" statusCol="rgba(0,225,120,0.85)"
              icon="A"
              iconBg="rgba(0,200,230,0.10)" iconBorder="rgba(0,200,230,0.30)" iconColor="rgba(0,220,255,0.90)"
            />
            <ExchangeRow
              name="Stripe" status="BILLING ACTIVE"    statusCol="rgba(0,114,255,0.82)"
              icon="$"
              iconBg="rgba(0,80,255,0.10)"  iconBorder="rgba(0,100,255,0.28)" iconColor="rgba(80,140,255,0.90)"
            />
          </div>
          <div style={{ marginTop:8, fontSize:8.5, fontFamily:SANS, color:DIM, lineHeight:1.6, padding:"0 4px" }}>
            Withdrawal permissions are never requested. Read + Trade permissions only.
          </div>
        </div>

        {/* ── Trading Account ───────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Trading Account" accent={C}/>
          <BrokerStatusCard/>
        </div>

        {/* ── Account ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom:12 }}>
          <SectionHead label="Account"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:14, overflow:"hidden" }}>
            <button onClick={openOnboarding} style={{
              width:"100%", padding:"17px 20px", background:"transparent", border:"none",
              borderBottom:"1px solid rgba(255,255,255,0.06)",
              display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
            }}>
              <div>
                <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W,
                  textAlign:"left" as const }}>AI Trading Account</div>
                <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>Powered by Alpaca · Sandbox paper mode</div>
              </div>
              <span style={{ fontSize:18, color:"rgba(255,255,255,0.30)" }}>›</span>
            </button>
            <button
              onClick={() => {
                if (!pushNotifs.subscribed) void pushNotifs.subscribe();
                else void pushNotifs.unsubscribe();
              }}
              disabled={pushNotifs.loading || pushNotifs.permission === "denied" || !pushNotifs.supported}
              style={{
                width:"100%", padding:"17px 20px", background:"transparent", border:"none",
                borderBottom:"1px solid rgba(255,255,255,0.06)",
                display:"flex", justifyContent:"space-between", alignItems:"center",
                cursor: pushNotifs.supported && pushNotifs.permission !== "denied" ? "pointer" : "default",
                opacity: !pushNotifs.supported ? 0.45 : 1,
              }}>
              <div>
                <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W, textAlign:"left" as const }}>
                  Push Notifications
                </div>
                <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>
                  {!pushNotifs.supported
                    ? "Not supported in this browser"
                    : pushNotifs.permission === "denied"
                      ? "Blocked by browser — check site settings"
                      : pushNotifs.subscribed
                        ? "Enabled · Trade alerts + signals"
                        : "Disabled · Tap to enable trade alerts"}
                </div>
              </div>
              <div style={{
                width:38, height:22, borderRadius:11,
                background: pushNotifs.subscribed ? "rgba(0,229,255,0.18)" : "rgba(255,255,255,0.07)",
                border:`1px solid ${pushNotifs.subscribed ? "rgba(0,229,255,0.38)" : "rgba(255,255,255,0.12)"}`,
                transition:"all 0.2s", display:"flex", alignItems:"center", padding:"2px", flexShrink:0,
              }}>
                <div style={{
                  width:16, height:16, borderRadius:"50%",
                  background: pushNotifs.subscribed ? C : "rgba(255,255,255,0.30)",
                  transform:`translateX(${pushNotifs.subscribed ? 16 : 0}px)`,
                  transition:"transform 0.22s", flexShrink:0,
                }}/>
              </div>
            </button>
            <button onClick={() => setLocation("/billing")} style={{
              width:"100%", padding:"17px 20px", background:"transparent", border:"none",
              display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
            }}>
              <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W,
                textAlign:"left" as const }}>Billing & Plan</div>
              <span style={{ fontSize:18, color:"rgba(255,255,255,0.30)" }}>›</span>
            </button>
          </div>
        </div>

        {/* ── Legal & Compliance ───────────────────────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          <SectionHead label="Legal & Compliance"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:14, overflow:"hidden" }}>
            {([
              ["Terms & Conditions", "/legal/terms"],
              ["Privacy Policy",     "/legal/privacy"],
              ["Risk Disclosure",    "/legal/risk"],
              ["Trading Disclaimer", "/legal/disclaimer"],
            ] as [string,string][]).map(([label, path], i, arr) => (
              <button key={path} onClick={() => setLocation(path)} style={{
                width:"100%", padding:"17px 20px", background:"transparent", border:"none",
                borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.06)":"none",
                display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
              }}>
                <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W,
                  textAlign:"left" as const }}>{label}</div>
                <span style={{ fontSize:18, color:"rgba(255,255,255,0.30)" }}>›</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <button onClick={() => signOut()} style={{
          width:"100%", padding:"15px 0", background:"transparent",
          border:"1px solid rgba(255,51,85,0.22)", borderRadius:12,
          color:"rgba(255,80,100,0.80)", fontFamily:SANS, fontSize:12, fontWeight:600,
          letterSpacing:"0.06em", cursor:"pointer", marginBottom:16,
        }}>Sign Out</button>

        {/* ── Disclaimer ───────────────────────────────────────────────────── */}
        <div style={{ background:CARD, border:`1px solid ${E}`,
          borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
          <div style={{ fontSize:10, fontFamily:SANS, color:"rgba(136,146,164,0.88)", lineHeight:1.75 }}>
            Trading involves risk and may result in loss of capital. Apex AI Trader does not provide
            financial advice. Past performance does not guarantee future results.
            A 3% performance fee applies only to profitable closed trades.
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ textAlign:"center" as const, fontSize:9, fontFamily:SANS,
          color:"rgba(136,146,164,0.65)", lineHeight:2.0 }}>
          AICandlez · Withdrawal permissions never requested
          <br/>
          7-Day AI Paper Trading Trial · 3% performance fee on profits only · v1.0.0
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.40;transform:scale(0.80)} }
        @keyframes page-in     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .page-enter            { animation: page-in 0.35s ease-out both; }
        input::placeholder     { color: rgba(136,146,164,0.45); }
        input                  { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
