import { useState, useEffect } from "react";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";

// ── Design tokens ─────────────────────────────────────────────────────────────
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace";
const C    = "#00e5ff";
const G    = "#00ff88";
const P    = "#9b5cf5";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";

// ── Step config ───────────────────────────────────────────────────────────────
const TOTAL_STEPS = 4; // 0-3 are user steps; 4=processing; 5=complete

// ── Helpers ───────────────────────────────────────────────────────────────────
function genAccount() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `APX-${s.slice(0,4)}-${s.slice(4)}`;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function Field({
  label, placeholder, value, onChange, type = "text", hint,
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string; hint?: string;
}) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:GR,
        letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:6 }}>
        {label}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width:"100%", boxSizing:"border-box" as const,
          padding:"12px 14px",
          background:"rgba(255,255,255,0.04)",
          border:`1px solid rgba(255,255,255,0.10)`,
          borderRadius:8, color:W,
          fontFamily:SANS, fontSize:13, outline:"none",
          transition:"border-color 0.2s",
        }}
        onFocus={e => { e.target.style.borderColor = "rgba(0,229,255,0.45)"; }}
        onBlur={e =>  { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
      />
      {hint && (
        <div style={{ fontSize:8, fontFamily:SANS, color:DIM, marginTop:4 }}>{hint}</div>
      )}
    </div>
  );
}

function OptionPill({
  label, selected, onSelect,
}: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} style={{
      padding:"9px 16px",
      background: selected ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.04)",
      border:     `1px solid ${selected ? "rgba(0,229,255,0.45)" : "rgba(255,255,255,0.10)"}`,
      borderRadius:8, color: selected ? C : GR,
      fontFamily:SANS, fontSize:12, fontWeight: selected ? 600 : 400,
      cursor:"pointer", transition:"all 0.15s",
    }}>
      {label}
    </button>
  );
}

function CheckRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display:"flex", gap:12, alignItems:"flex-start", cursor:"pointer",
      padding:"12px 0", borderBottom:"1px solid rgba(255,255,255,0.05)",
    }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          flexShrink:0, width:18, height:18, marginTop:1, borderRadius:5,
          background: checked ? C : "transparent",
          border: `1.5px solid ${checked ? C : "rgba(255,255,255,0.20)"}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"all 0.15s",
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.8 7L9 1" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span style={{ fontSize:12, fontFamily:SANS, color:GR, lineHeight:1.65 }}>{label}</span>
    </label>
  );
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function ProgressDots({ step }: { step: number }) {
  const dots = [0,1,2,3];
  return (
    <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:28 }}>
      {dots.map(i => (
        <div key={i} style={{
          width: i === step ? 20 : 6, height:6,
          borderRadius:3,
          background: i < step ? G : i === step ? C : "rgba(255,255,255,0.12)",
          transition:"all 0.3s ease",
        }}/>
      ))}
    </div>
  );
}

// ── Step 0: Welcome ───────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ textAlign:"center" as const }}>
      {/* Icon */}
      <div style={{
        width:72, height:72, borderRadius:20, margin:"0 auto 24px",
        background:"rgba(0,229,255,0.08)",
        border:"1px solid rgba(0,229,255,0.22)",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke={C} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke={C} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
          <path d="M2 12L12 17L22 12" stroke={C} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.35"/>
        </svg>
      </div>

      <div style={{ fontSize:22, fontFamily:SANS, fontWeight:700, color:W,
        letterSpacing:"-0.01em", marginBottom:10, lineHeight:1.3 }}>
        Open Your AI Trading Account
      </div>
      <div style={{ fontSize:13, fontFamily:SANS, color:GR, lineHeight:1.8,
        marginBottom:28 }}>
        Start paper trading in minutes.{"\n"}Powered by Alpaca's institutional infrastructure.
      </div>

      {/* Feature list */}
      {[
        { icon:"◉", text:"No real money required to get started",    col:G },
        { icon:"◉", text:"AI executes simulated trades automatically", col:G },
        { icon:"◉", text:"Full brokerage account infrastructure",     col:C },
        { icon:"◉", text:"Upgrade to live trading anytime",           col:P },
      ].map(({ icon, text, col }) => (
        <div key={text} style={{ display:"flex", gap:10, alignItems:"center",
          marginBottom:10, textAlign:"left" as const }}>
          <span style={{ fontSize:8, color:col, flexShrink:0 }}>{icon}</span>
          <span style={{ fontSize:12, fontFamily:SANS, color:GR }}>{text}</span>
        </div>
      ))}

      <button onClick={onNext} style={{
        width:"100%", padding:"15px 0", marginTop:24,
        background:`linear-gradient(135deg, rgba(0,229,255,0.18), rgba(155,92,245,0.14))`,
        border:`1px solid rgba(0,229,255,0.45)`,
        borderRadius:12, color:C,
        fontFamily:SANS, fontSize:14, fontWeight:700,
        letterSpacing:"0.02em", cursor:"pointer",
      }}>
        Get Started →
      </button>

      <div style={{ marginTop:14, fontSize:8, fontFamily:SANS, color:DIM }}>
        Sandbox mode · No real money · Paper trading only
      </div>
    </div>
  );
}

// ── Step 1: Identity ──────────────────────────────────────────────────────────
interface IdentityFields { firstName:string; lastName:string; dob:string; ssnLast4:string; }

function StepIdentity({
  data, setData,
}: { data: IdentityFields; setData: (d: IdentityFields) => void }) {
  return (
    <div>
      <div style={{ fontSize:18, fontFamily:SANS, fontWeight:700, color:W,
        marginBottom:6 }}>Identity Verification</div>
      <div style={{ fontSize:11, fontFamily:SANS, color:GR, marginBottom:24, lineHeight:1.6 }}>
        Required for regulatory compliance. Your data is encrypted and never shared.
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 12px" }}>
        <Field label="First Name"  placeholder="Alex"   value={data.firstName}
          onChange={v => setData({ ...data, firstName: v })} />
        <Field label="Last Name"   placeholder="Morgan" value={data.lastName}
          onChange={v => setData({ ...data, lastName: v })} />
      </div>
      <Field label="Date of Birth" placeholder="MM/DD/YYYY" value={data.dob}
        onChange={v => setData({ ...data, dob: v })}
        hint="Must be 18 or older to open an account" />
      <Field label="SSN Last 4 Digits" placeholder="••••" value={data.ssnLast4}
        type="password"
        onChange={v => setData({ ...data, ssnLast4: v.slice(0,4) })}
        hint="Used for identity verification only — never stored in plaintext" />
    </div>
  );
}

// ── Step 2: KYC / Financial ───────────────────────────────────────────────────
interface KycFields { employment:string; income:string; experience:string; }

const EMP_OPTIONS  = ["Employed","Self-Employed","Retired","Student","Unemployed"];
const INC_OPTIONS  = ["Under $25K","$25K–$50K","$50K–$100K","$100K–$250K","$250K+"];
const EXP_OPTIONS  = ["None","Less than 1 year","1–3 years","3–5 years","5+ years"];

function StepKYC({
  data, setData,
}: { data: KycFields; setData: (d: KycFields) => void }) {
  return (
    <div>
      <div style={{ fontSize:18, fontFamily:SANS, fontWeight:700, color:W, marginBottom:6 }}>
        Financial Profile
      </div>
      <div style={{ fontSize:11, fontFamily:SANS, color:GR, marginBottom:24, lineHeight:1.6 }}>
        Alpaca requires this information to open a brokerage account.
      </div>

      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:GR,
          letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:10 }}>
          Employment Status
        </div>
        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8 }}>
          {EMP_OPTIONS.map(o => (
            <OptionPill key={o} label={o} selected={data.employment===o}
              onSelect={() => setData({ ...data, employment:o })}/>
          ))}
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:GR,
          letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:10 }}>
          Annual Income
        </div>
        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8 }}>
          {INC_OPTIONS.map(o => (
            <OptionPill key={o} label={o} selected={data.income===o}
              onSelect={() => setData({ ...data, income:o })}/>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:GR,
          letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:10 }}>
          Trading Experience
        </div>
        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8 }}>
          {EXP_OPTIONS.map(o => (
            <OptionPill key={o} label={o} selected={data.experience===o}
              onSelect={() => setData({ ...data, experience:o })}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Disclosures ───────────────────────────────────────────────────────
interface DisclosureFields { risk:boolean; paperOnly:boolean; age:boolean; terms:boolean; }

function StepDisclosures({
  data, setData,
}: { data: DisclosureFields; setData: (d: DisclosureFields) => void }) {
  return (
    <div>
      <div style={{ fontSize:18, fontFamily:SANS, fontWeight:700, color:W, marginBottom:6 }}>
        Disclosures & Agreements
      </div>
      <div style={{ fontSize:11, fontFamily:SANS, color:GR, marginBottom:20, lineHeight:1.6 }}>
        Please review and acknowledge the following before we create your account.
      </div>
      <CheckRow
        label="I understand that trading involves substantial risk of loss and past performance does not guarantee future results."
        checked={data.risk}
        onChange={v => setData({ ...data, risk:v })}
      />
      <CheckRow
        label="I acknowledge this account operates in paper (simulated) trading mode only. No real money is at risk."
        checked={data.paperOnly}
        onChange={v => setData({ ...data, paperOnly:v })}
      />
      <CheckRow
        label="I confirm I am 18 years of age or older and legally eligible to open a brokerage account."
        checked={data.age}
        onChange={v => setData({ ...data, age:v })}
      />
      <CheckRow
        label="I agree to the AICandlez Terms of Service, Privacy Policy, and Alpaca's Customer Agreement."
        checked={data.terms}
        onChange={v => setData({ ...data, terms:v })}
      />
    </div>
  );
}

// ── Step 4: Processing ────────────────────────────────────────────────────────
function StepProcessing({ onComplete }: { onComplete: (acct: string) => void }) {
  const [phase, setPhase] = useState(0);
  const phases = [
    "Submitting application to Alpaca...",
    "Verifying identity...",
    "Creating brokerage account...",
    "Activating paper trading...",
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1700);
    const t3 = setTimeout(() => setPhase(3), 2600);
    const t4 = setTimeout(() => { onComplete(genAccount()); }, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onComplete]);

  return (
    <div style={{ textAlign:"center" as const, padding:"32px 0" }}>
      {/* Spinner */}
      <div style={{ position:"relative", width:64, height:64, margin:"0 auto 28px" }}>
        <div style={{
          position:"absolute", inset:0,
          border:`2px solid rgba(255,255,255,0.06)`,
          borderTopColor: C,
          borderRadius:"50%",
          animation:"ac-spin 0.8s linear infinite",
        }}/>
        <div style={{
          position:"absolute", inset:8,
          border:`2px solid rgba(255,255,255,0.04)`,
          borderTopColor: P,
          borderRadius:"50%",
          animation:"ac-spin 1.3s linear reverse infinite",
        }}/>
      </div>

      <div style={{ fontSize:16, fontFamily:SANS, fontWeight:600, color:W,
        marginBottom:10 }}>
        Setting Up Your Account
      </div>

      {phases.map((p, i) => (
        <div key={p} style={{
          fontSize:11, fontFamily:SANS,
          color: i < phase ? G : i === phase ? C : "rgba(255,255,255,0.20)",
          marginBottom:8, transition:"color 0.4s ease",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          {i < phase && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.8 7L9 1" stroke={G} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )}
          {p}
        </div>
      ))}

      <div style={{ marginTop:28, fontSize:8, fontFamily:SANS, color:DIM }}>
        Powered by Alpaca Broker API · Sandbox Environment
      </div>

      <style>{`
        @keyframes ac-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Step 5: Complete ──────────────────────────────────────────────────────────
function StepComplete({ accountNumber, onDone }: { accountNumber: string; onDone: () => void }) {
  return (
    <div style={{ textAlign:"center" as const }}>
      {/* Success ring */}
      <div style={{ position:"relative", width:80, height:80, margin:"0 auto 24px" }}>
        <div style={{
          position:"absolute", inset:0, borderRadius:"50%",
          background:"rgba(0,255,136,0.08)",
          border:"1.5px solid rgba(0,255,136,0.35)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <svg width="34" height="28" viewBox="0 0 34 28" fill="none">
            <path d="M2 14L12 24L32 2" stroke={G} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <div style={{ fontSize:22, fontFamily:SANS, fontWeight:700, color:W,
        marginBottom:8 }}>
        Account Active!
      </div>
      <div style={{ fontSize:13, fontFamily:SANS, color:GR, lineHeight:1.8, marginBottom:20 }}>
        Your AI-powered paper trading account is ready.
        The AI engine will begin analyzing markets immediately.
      </div>

      {/* Account number card */}
      <div style={{
        background:"rgba(0,255,136,0.05)",
        border:"1px solid rgba(0,255,136,0.18)",
        borderRadius:10, padding:"12px 16px", marginBottom:24,
      }}>
        <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:GR,
          letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:6 }}>
          Account Number
        </div>
        <div style={{ fontSize:16, fontFamily:MONO, fontWeight:700, color:G,
          letterSpacing:"0.08em" }}>
          {accountNumber}
        </div>
        <div style={{ fontSize:8, fontFamily:SANS, color:DIM, marginTop:4 }}>
          Alpaca Sandbox · Paper Trading Mode
        </div>
      </div>

      {[
        { label:"Starting Balance", value:"$100,000.00",  color:G },
        { label:"Account Type",     value:"Paper / Sim",   color:C },
        { label:"AI Mode",          value:"Auto-Trading",  color:P },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.05)",
        }}>
          <span style={{ fontSize:11, fontFamily:SANS, color:GR }}>{label}</span>
          <span style={{ fontSize:12, fontFamily:MONO, fontWeight:600, color }}>{value}</span>
        </div>
      ))}

      <button onClick={onDone} style={{
        width:"100%", padding:"15px 0", marginTop:24,
        background:"rgba(0,255,136,0.12)",
        border:"1px solid rgba(0,255,136,0.38)",
        borderRadius:12, color:G,
        fontFamily:SANS, fontSize:14, fontWeight:700,
        letterSpacing:"0.02em", cursor:"pointer",
      }}>
        Start Trading →
      </button>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function TradingAccountOnboardingModal() {
  const { isOnboardingOpen, closeOnboarding, setStatus } = useBrokerConnection();

  const [step, setStep]      = useState(0);
  const [account, setAccount]  = useState("");

  // Form state
  const [identity, setIdentity] = useState<IdentityFields>({
    firstName:"", lastName:"", dob:"", ssnLast4:"",
  });
  const [kyc, setKyc] = useState<KycFields>({
    employment:"", income:"", experience:"",
  });
  const [disclosures, setDisclosures] = useState<DisclosureFields>({
    risk:false, paperOnly:false, age:false, terms:false,
  });

  if (!isOnboardingOpen) return null;

  const isProcessing = step === 4;
  const isComplete   = step === 5;
  const isUserStep   = step >= 0 && step <= 3;

  // Validation per step
  const canAdvance = (() => {
    if (step === 0) return true;
    if (step === 1) return !!identity.firstName && !!identity.lastName && !!identity.dob && identity.ssnLast4.length === 4;
    if (step === 2) return !!kyc.employment && !!kyc.income && !!kyc.experience;
    if (step === 3) return disclosures.risk && disclosures.paperOnly && disclosures.age && disclosures.terms;
    return true;
  })();

  const handleNext = () => {
    if (step === 3) {
      setStatus("onboarding");
      setStep(4); // processing
    } else if (step < 4) {
      setStep(s => s + 1);
    }
  };

  const handleComplete = (acct: string) => {
    setAccount(acct);
    setStatus("paper_active", acct);
    setStep(5);
  };

  const handleClose = () => {
    if (!isProcessing) {
      closeOnboarding();
      if (!isComplete) {
        // Reset to start next time if not complete
        setStep(0);
      }
    }
  };

  const handleDone = () => {
    closeOnboarding();
    setStep(0);
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position:"fixed", inset:0, zIndex:9990,
          background:"rgba(0,0,0,0.88)",
          backdropFilter:"blur(6px)",
        }}
      />

      {/* Modal */}
      <div style={{
        position:"fixed", inset:0, zIndex:9999,
        display:"flex", alignItems:"flex-end",
        justifyContent:"center",
        pointerEvents:"none",
      }}>
        <div style={{
          width:"100%", maxWidth:480,
          maxHeight:"92dvh",
          background:"#050c14",
          borderTop:"1px solid rgba(0,229,255,0.18)",
          borderRadius:"20px 20px 0 0",
          overflow:"hidden",
          display:"flex", flexDirection:"column",
          pointerEvents:"auto",
          animation:"slide-up 0.35s cubic-bezier(0.32,0.72,0,1) both",
        }}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"18px 20px 12px",
            borderBottom:`1px solid ${E}`,
            flexShrink:0,
          }}>
            <div style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
              color:"rgba(255,255,255,0.25)", letterSpacing:"0.22em" }}>
              AICANDLEZ
            </div>
            {!isProcessing && (
              <button onClick={handleClose} style={{
                width:28, height:28, borderRadius:"50%",
                background:"rgba(255,255,255,0.06)",
                border:"1px solid rgba(255,255,255,0.10)",
                color:GR, fontFamily:SANS, fontSize:14, lineHeight:1,
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                ×
              </button>
            )}
          </div>

          {/* ── Scrollable content ──────────────────────────────────────────── */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 0" }}>
            {/* Progress dots (steps 0–3) */}
            {isUserStep && <ProgressDots step={step} />}

            {/* Step content */}
            {step === 0 && <StepWelcome onNext={handleNext} />}
            {step === 1 && <StepIdentity data={identity} setData={setIdentity} />}
            {step === 2 && <StepKYC data={kyc} setData={setKyc} />}
            {step === 3 && <StepDisclosures data={disclosures} setData={setDisclosures} />}
            {step === 4 && <StepProcessing onComplete={handleComplete} />}
            {step === 5 && <StepComplete accountNumber={account} onDone={handleDone} />}
          </div>

          {/* ── Footer actions (steps 1–3 only) ───────────────────────────── */}
          {(step >= 1 && step <= 3) && (
            <div style={{
              flexShrink:0, padding:"16px 20px",
              borderTop:`1px solid ${E}`,
              display:"flex", gap:10,
            }}>
              <button onClick={() => setStep(s => s - 1)} style={{
                flex:1, padding:"13px 0",
                background:"transparent",
                border:"1px solid rgba(255,255,255,0.12)",
                borderRadius:10, color:GR,
                fontFamily:SANS, fontSize:13, fontWeight:500, cursor:"pointer",
              }}>
                Back
              </button>
              <button onClick={handleNext} disabled={!canAdvance} style={{
                flex:2, padding:"13px 0",
                background: canAdvance ? "rgba(0,229,255,0.14)" : "rgba(255,255,255,0.04)",
                border:`1px solid ${canAdvance ? "rgba(0,229,255,0.45)" : "rgba(255,255,255,0.08)"}`,
                borderRadius:10,
                color: canAdvance ? C : DIM,
                fontFamily:SANS, fontSize:13, fontWeight:700,
                cursor: canAdvance ? "pointer" : "not-allowed",
                transition:"all 0.15s",
              }}>
                {step === 3 ? "Submit Application" : "Continue →"}
              </button>
            </div>
          )}

          {/* ── Powered by Alpaca ──────────────────────────────────────────── */}
          {!isComplete && (
            <div style={{
              flexShrink:0,
              padding:"10px 20px 16px",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              <div style={{
                padding:"3px 10px",
                background:"rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:4,
                fontSize:7, fontFamily:SANS, fontWeight:600,
                color:"rgba(136,146,164,0.50)", letterSpacing:"0.14em",
                textTransform:"uppercase" as const,
              }}>
                Powered by Alpaca
              </div>
              <span style={{ fontSize:7, fontFamily:SANS, color:"rgba(136,146,164,0.35)" }}>
                ·
              </span>
              <span style={{ fontSize:7, fontFamily:SANS, color:"rgba(136,146,164,0.35)" }}>
                Sandbox · Paper Mode Only
              </span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
