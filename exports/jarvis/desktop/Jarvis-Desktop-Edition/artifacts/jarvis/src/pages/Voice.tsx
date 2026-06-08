import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AudioLines,
  Radio,
  Trash2,
  History,
  ShieldAlert,
  Loader2,
  Send,
  Keyboard,
  Cloud,
  Mic,
  Ear,
  Hand,
  Settings2,
  FlaskConical,
  RotateCcw,
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { JarvisOrb, type OrbState } from "@/components/voice/JarvisOrb";
import {
  useVoiceSettings,
  useSetVoiceSettings,
  useVoiceSessions,
  useStartVoiceSession,
  useEndVoiceSession,
  usePurgeVoiceSession,
  useSessionTurns,
  useVoiceTurn,
  useVoiceTextTurn,
  type JarvisVoiceSession,
  type JarvisVoiceTurnResult,
} from "@/hooks/useJarvisApi";
import {
  supportsBrowserSTT,
  supportsBrowserTTS,
  supportsMicrophone,
  startBrowserRecognition,
  startContinuousRecognition,
  stripWakePhrase,
  speakBrowser,
  cancelBrowserSpeech,
  type BrowserRecognizer,
  type ContinuousRecognizer,
} from "@/lib/voice/speech";

type InputMode = "browser" | "server" | "text";

function intentTone(intent: string | null): string {
  switch (intent) {
    case "clarify":
      return "border-amber-500/30 bg-amber-500/10 text-amber-500";
    case "reject":
    case "unknown":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  }
}

function fmtTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function VoiceDisabledBanner() {
  return (
    <Card className="flex items-start gap-4 border-amber-500/30 bg-amber-500/5 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-500">
        <ShieldAlert className="h-5 w-5" />
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-semibold">Voice interface is off</div>
        <div className="text-xs text-muted-foreground">
          The executive voice interface is disabled by default. An administrator
          must enable it before commands can be processed. Voice is an
          input/output surface only — it never bypasses governance.
        </div>
      </div>
    </Card>
  );
}

function TurnResultCard({
  result,
  spokenInBrowser,
  onReplay,
}: {
  result: JarvisVoiceTurnResult;
  spokenInBrowser: boolean;
  onReplay: () => void;
}) {
  const canReplay = Boolean(
    result.audioBase64 || (spokenInBrowser && result.replyText.trim()),
  );
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("font-mono", intentTone(result.intent))}>
          {result.intent}
        </Badge>
        {result.capability ? (
          <Badge variant="outline" className="font-mono">
            {result.capability}
          </Badge>
        ) : null}
        <Badge variant="outline" className="font-mono text-muted-foreground">
          {result.latencyMs}ms
        </Badge>
        {result.ttsOk ? (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-500"
          >
            <AudioLines className="mr-1 h-3 w-3" /> premium readback
          </Badge>
        ) : spokenInBrowser ? (
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 font-mono text-primary"
          >
            <AudioLines className="mr-1 h-3 w-3" /> browser readback
          </Badge>
        ) : (
          <Badge variant="outline" className="font-mono text-muted-foreground">
            text-only
          </Badge>
        )}
        {canReplay ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={onReplay}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Replay
          </Button>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          You said
          {result.transcriptConfidence != null
            ? ` · ${result.transcriptConfidence}% confidence`
            : ""}
        </div>
        <div className="text-sm">
          {result.transcript || (
            <span className="text-muted-foreground">(no transcript)</span>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Jarvis
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {result.replyText}
        </div>
      </div>

      {result.links.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {result.links.map((l) => (
            <Badge
              key={`${l.type}:${l.id}`}
              variant="outline"
              className="font-mono text-[10px] text-muted-foreground"
            >
              {l.type}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function SessionHistory({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useSessionTurns(sessionId);

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  const turns = data?.turns ?? [];
  if (turns.length === 0) {
    return (
      <div className="px-1 py-4 text-center text-xs text-muted-foreground">
        No turns recorded for this session yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {turns.map((turn) => (
        <div
          key={turn.id}
          className="rounded-md border border-border bg-card/40 p-3"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              #{turn.turnIndex + 1}
            </span>
            <Badge
              variant="outline"
              className={cn("font-mono text-[10px]", intentTone(turn.intent))}
            >
              {turn.intent ?? "—"}
            </Badge>
            {turn.capability ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                {turn.capability}
              </Badge>
            ) : null}
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {fmtTime(turn.createdAt)}
            </span>
          </div>
          {turn.transcript ? (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Q:</span>{" "}
              {turn.transcript}
            </div>
          ) : null}
          {turn.replyText ? (
            <div className="mt-1 whitespace-pre-wrap text-xs">
              <span className="font-medium text-primary">A:</span> {turn.replyText}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function Voice() {
  const { isAdmin } = useUserRole();

  const settings = useVoiceSettings();
  const setSettings = useSetVoiceSettings();
  const sessions = useVoiceSessions();
  const startSession = useStartVoiceSession();
  const endSession = useEndVoiceSession();
  const purgeSession = usePurgeVoiceSession();
  const voiceTurn = useVoiceTurn();
  const textTurn = useVoiceTextTurn();

  const enabled = settings.data?.enabled ?? false;

  // ── Browser capability detection (decides the default input mode) ───────────
  const caps = useMemo(
    () => ({
      browserStt: supportsBrowserSTT(),
      browserTts: supportsBrowserTTS(),
      mic: supportsMicrophone(),
    }),
    [],
  );

  const [inputMode, setInputMode] = useState<InputMode>(() =>
    supportsBrowserSTT() ? "browser" : "text",
  );
  const [handsFree, setHandsFree] = useState(false);
  const [wakeWordOnly, setWakeWordOnly] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<JarvisVoiceTurnResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [textValue, setTextValue] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognizerRef = useRef<BrowserRecognizer | null>(null);
  const continuousRef = useRef<ContinuousRecognizer | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const playedTurnRef = useRef<string | null>(null);

  // Mirrors for values read inside long-lived recognition callbacks.
  const speakingRef = useRef(false);
  const wakeWordOnlyRef = useRef(false);
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);
  useEffect(() => {
    wakeWordOnlyRef.current = wakeWordOnly;
  }, [wakeWordOnly]);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Readback (centralized so we can track "speaking" + support barge-in) ────
  const stopReadback = useCallback(() => {
    cancelBrowserSpeech();
    const el = audioElRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    setSpeaking(false);
  }, []);

  const playReadback = useCallback(
    (result: JarvisVoiceTurnResult, force = false) => {
      if (!force && playedTurnRef.current === result.turnId) return;
      playedTurnRef.current = result.turnId;

      cancelBrowserSpeech();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      if (result.audioBase64 && result.audioContentType) {
        try {
          const bytes = Uint8Array.from(atob(result.audioBase64), (c) =>
            c.charCodeAt(0),
          );
          const blob = new Blob([bytes], { type: result.audioContentType });
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          const el = audioElRef.current;
          if (el) {
            el.src = url;
            el.onended = () => setSpeaking(false);
            void el
              .play()
              .then(() => setSpeaking(true))
              .catch(() => setSpeaking(false));
          }
        } catch {
          /* decode failed — text remains on screen */
        }
      } else if (caps.browserTts && result.replyText.trim()) {
        setSpeaking(true);
        speakBrowser(result.replyText, {
          onEnd: () => setSpeaking(false),
        });
      }
    },
    [caps.browserTts],
  );

  useEffect(() => {
    return () => {
      stopTracks();
      recognizerRef.current?.abort();
      continuousRef.current?.abort();
      cancelBrowserSpeech();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [stopTracks]);

  async function onToggleEnabled(next: boolean) {
    try {
      await setSettings.mutateAsync({ enabled: next });
      toast.success(next ? "Voice interface enabled." : "Voice interface disabled.");
      if (!next) {
        stopReadback();
        continuousRef.current?.stop();
        setListening(false);
      }
    } catch {
      toast.error("Toggle failed — you may lack the required role.");
    }
  }

  async function ensureSession(): Promise<string | null> {
    if (activeSessionId) return activeSessionId;
    try {
      const res = await startSession.mutateAsync(null);
      setActiveSessionId(res.session.id);
      return res.session.id;
    } catch {
      toast.error("Could not start a voice session.");
      return null;
    }
  }

  const handleResult = useCallback(
    (result: JarvisVoiceTurnResult) => {
      setLastResult(result);
      playReadback(result);
      if (result.status !== "ok") {
        toast.message("Turn completed with a degraded result.", {
          description: result.replyText.slice(0, 120),
        });
      }
    },
    [playReadback],
  );

  // ── Text-turn dispatch (browser STT + hands-free + typed all route here) ────
  async function sendTranscript(
    sessionId: string,
    transcript: string,
    source: "text" | "browser-stt",
  ) {
    try {
      const result = await textTurn.mutateAsync({ sessionId, transcript, source });
      handleResult(result);
    } catch {
      toast.error("Voice turn failed.");
    }
  }

  // ── Server STT (premium): record audio, upload binary ───────────────────────
  async function startServerRecording() {
    if (!enabled || recording) return;
    const sessionId = await ensureSession();
    if (!sessionId) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access was denied.");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stopTracks();
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      if (blob.size === 0) {
        toast.error("No audio captured.");
        return;
      }
      try {
        const result = await voiceTurn.mutateAsync({ sessionId, audio: blob });
        handleResult(result);
      } catch {
        toast.error("Voice turn failed.");
      }
    };
    recorder.start();
    setRecording(true);
  }

  function stopServerRecording() {
    if (!recording) return;
    setRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  // ── Browser STT single-shot (push-to-talk) ──────────────────────────────────
  async function startBrowserListening() {
    if (!enabled || recording) return;
    const sessionId = await ensureSession();
    if (!sessionId) return;

    stopReadback();
    const recognizer = startBrowserRecognition({
      lang: "en-GB",
      onResult: (transcript) => void sendTranscript(sessionId, transcript, "browser-stt"),
      onError: (err) => {
        setRecording(false);
        if (err !== "aborted" && err !== "no-speech") {
          toast.error("Speech recognition failed — try typing instead.");
        }
      },
      onEnd: () => {
        setRecording(false);
        recognizerRef.current = null;
      },
    });

    if (!recognizer) {
      toast.error("Speech recognition is unavailable — use text instead.");
      setInputMode("text");
      return;
    }
    recognizerRef.current = recognizer;
    setRecording(true);
  }

  function stopBrowserListening() {
    if (!recording) return;
    recognizerRef.current?.stop();
  }

  // ── Hands-free continuous STT (wake-phrase aware, barge-in) ──────────────────
  async function startHandsFree() {
    if (!enabled || listening) return;
    const sessionId = await ensureSession();
    if (!sessionId) return;

    stopReadback();
    const rec = startContinuousRecognition({
      lang: "en-GB",
      onInterim: (t) => {
        setInterim(t);
        // Barge-in: the executive speaking over Jarvis cuts the readback.
        if (speakingRef.current) stopReadback();
      },
      onFinal: (t) => {
        setInterim("");
        let command = t;
        if (wakeWordOnlyRef.current) {
          const { matched, command: stripped } = stripWakePhrase(t);
          if (!matched) return; // not addressed to Jarvis — ignore
          command = stripped;
        }
        if (!command.trim()) return;
        void sendTranscript(sessionId, command, "browser-stt");
      },
      onError: () => {
        toast.error("Hands-free recognition failed — falling back.");
      },
      onEnd: () => {
        setListening(false);
        continuousRef.current = null;
      },
    });

    if (!rec) {
      toast.error("Hands-free is unavailable in this browser — use push-to-talk.");
      setHandsFree(false);
      return;
    }
    continuousRef.current = rec;
    setListening(true);
  }

  function stopHandsFree() {
    continuousRef.current?.stop();
    continuousRef.current = null;
    setListening(false);
    setInterim("");
  }

  // ── Orb primary action — context-sensitive on the current mode ──────────────
  function onOrbPrimary() {
    if (!enabled) return;
    if (speaking) {
      stopReadback();
      return;
    }
    if (handsFree) {
      if (listening) stopHandsFree();
      else void startHandsFree();
      return;
    }
    if (inputMode === "server") {
      if (recording) stopServerRecording();
      else void startServerRecording();
      return;
    }
    if (inputMode === "browser") {
      if (recording) stopBrowserListening();
      else void startBrowserListening();
    }
  }

  // ── Text command ────────────────────────────────────────────────────────────
  async function onSendText() {
    const value = textValue.trim();
    if (!enabled || !value || textTurn.isPending) return;
    const sessionId = await ensureSession();
    if (!sessionId) return;
    try {
      const result = await textTurn.mutateAsync({
        sessionId,
        transcript: value,
        source: "text",
      });
      setLastResult(result);
      setTextValue("");
      playReadback(result);
      if (result.status !== "ok") {
        toast.message("Turn completed with a degraded result.", {
          description: result.replyText.slice(0, 120),
        });
      }
    } catch {
      toast.error("Command failed.");
    }
  }

  async function onEndSession() {
    if (!activeSessionId) return;
    try {
      await endSession.mutateAsync(activeSessionId);
      toast.success("Session ended.");
      setActiveSessionId(null);
    } catch {
      toast.error("Could not end the session.");
    }
  }

  async function onPurge(session: JarvisVoiceSession) {
    try {
      const res = await purgeSession.mutateAsync(session.id);
      toast.success(`Purged ${res.turnsDeleted} transcript(s).`);
      if (session.id === activeSessionId) {
        setActiveSessionId(null);
        setLastResult(null);
      }
    } catch {
      toast.error("Purge failed — you may lack the required role.");
    }
  }

  function onToggleHandsFree(next: boolean) {
    setHandsFree(next);
    if (!next && listening) stopHandsFree();
  }

  const processing = voiceTurn.isPending || textTurn.isPending;
  const orbState: OrbState = !enabled
    ? "disabled"
    : processing
      ? "processing"
      : speaking
        ? "speaking"
        : recording || listening
          ? "listening"
          : "idle";

  const orbInteractive = enabled && (handsFree || inputMode !== "text");

  const statusLine = !enabled
    ? "Voice interface is offline"
    : processing
      ? "Processing your command…"
      : speaking
        ? "Jarvis is speaking — tap to interrupt"
        : listening
          ? wakeWordOnly
            ? 'Hands-free · say "Jarvis" followed by a command'
            : "Hands-free · listening continuously"
          : recording
            ? "Listening — tap to send"
            : handsFree
              ? "Tap the orb to begin hands-free"
              : inputMode === "text"
                ? "Type a command below"
                : "Tap the orb to speak";

  const modeButtons: { mode: InputMode; label: string; icon: typeof Mic; available: boolean }[] = [
    { mode: "browser", label: "Browser voice", icon: Mic, available: caps.browserStt },
    { mode: "server", label: "Premium voice", icon: Cloud, available: caps.mic },
    { mode: "text", label: "Text", icon: Keyboard, available: true },
  ];

  const spokenInBrowser = lastResult ? !lastResult.audioBase64 && caps.browserTts : false;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <audio ref={audioElRef} className="hidden" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Voice</h1>
            <p className="text-sm text-muted-foreground">
              Executive command interface. Read &amp; advisory only — transcripts
              are retained, audio is never stored.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/voice-test">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FlaskConical className="h-3.5 w-3.5" /> Voice Test
            </Button>
          </Link>
          <Link href="/voice-settings">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Voice Settings
            </Button>
          </Link>
          {isAdmin ? (
            <Card className="flex items-center gap-3 px-4 py-2.5">
              <Label htmlFor="voice-enabled" className="text-sm">
                Voice interface
              </Label>
              <Switch
                id="voice-enabled"
                checked={enabled}
                disabled={settings.isLoading || setSettings.isPending}
                onCheckedChange={onToggleEnabled}
              />
            </Card>
          ) : null}
        </div>
      </div>

      {!enabled ? <VoiceDisabledBanner /> : null}

      {/* ── Command stage: the orb ──────────────────────────────────────────── */}
      <Card className="relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="relative flex flex-col items-center gap-6">
          <JarvisOrb
            state={orbState}
            size={240}
            onClick={orbInteractive ? onOrbPrimary : undefined}
          />

          <div className="text-center">
            <div className="text-sm font-medium">{statusLine}</div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              {activeSessionId
                ? `Session ${activeSessionId.slice(0, 8)}`
                : "A session starts on your first turn"}
            </div>
          </div>

          {/* Live transcript window */}
          <div className="min-h-[3.5rem] w-full max-w-xl rounded-md border border-border bg-card/40 px-4 py-3 text-center">
            {interim ? (
              <span className="text-sm text-foreground">{interim}</span>
            ) : lastResult?.transcript ? (
              <span className="text-sm text-muted-foreground">
                {lastResult.transcript}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Your words will appear here as you speak.
              </span>
            )}
          </div>

          {speaking ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={stopReadback}
            >
              <StopCircle className="h-4 w-4" /> Interrupt
            </Button>
          ) : null}
        </div>
      </Card>

      {/* ── Mode controls ───────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Ear className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="hands-free" className="text-sm">
              Hands-free
            </Label>
            <Switch
              id="hands-free"
              checked={handsFree}
              disabled={!enabled || !caps.browserStt}
              onCheckedChange={onToggleHandsFree}
            />
          </div>

          {handsFree ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="wake-word" className="text-sm text-muted-foreground">
                Require wake word "Jarvis"
              </Label>
              <Switch
                id="wake-word"
                checked={wakeWordOnly}
                disabled={!enabled}
                onCheckedChange={setWakeWordOnly}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Hand className="h-4 w-4 text-muted-foreground" />
              <span className="mr-1 text-xs text-muted-foreground">Input</span>
              {modeButtons.map(({ mode, label, icon: Icon, available }) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={inputMode === mode ? "default" : "outline"}
                  disabled={!available}
                  onClick={() => setInputMode(mode)}
                  className="gap-1.5"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          )}

          <span className="ml-auto text-[10px] text-muted-foreground">
            {handsFree
              ? "Continuous recognition · auto-send on each phrase"
              : inputMode === "server"
                ? "Premium speech (ElevenLabs) — falls back to text when unconfigured"
                : inputMode === "browser"
                  ? caps.browserTts
                    ? "Browser speech · British readback"
                    : "Browser speech · text readback"
                  : "Type a command — always available"}
          </span>
        </div>

        {/* Text command — always available as a fallback */}
        <div className="flex items-center gap-2">
          <Input
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onSendText();
              }
            }}
            placeholder={
              enabled ? "Type a command for Jarvis…" : "Enable voice to send commands"
            }
            disabled={!enabled || processing}
            aria-label="Type a command"
          />
          <Button
            type="button"
            onClick={onSendText}
            disabled={!enabled || processing || textValue.trim().length === 0}
            className="gap-1.5"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </Button>
        </div>

        {activeSessionId ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={onEndSession}
              disabled={endSession.isPending}
            >
              End session
            </Button>
          </div>
        ) : null}
      </Card>

      {lastResult ? (
        <TurnResultCard
          result={lastResult}
          spokenInBrowser={spokenInBrowser}
          onReplay={() => lastResult && playReadback(lastResult, true)}
        />
      ) : null}

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Sessions</h2>
        </div>
        {sessions.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (sessions.data ?? []).length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No voice sessions yet.
          </div>
        ) : (
          <div className="space-y-2">
            {(sessions.data ?? []).map((session) => {
              const open = session.id === activeSessionId;
              return (
                <div key={session.id} className="rounded-md border border-border">
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px]",
                        session.status === "active"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                          : "text-muted-foreground",
                      )}
                    >
                      {session.status}
                    </Badge>
                    <span className="font-mono text-xs">
                      {session.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {session.turnCount} turn(s)
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {fmtTime(session.startedAt)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setActiveSessionId(open ? null : session.id)
                      }
                    >
                      {open ? "Hide" : "View"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onPurge(session)}
                      disabled={purgeSession.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {open ? (
                    <div className="border-t border-border p-3">
                      <ScrollArea className="max-h-80">
                        <SessionHistory sessionId={session.id} />
                      </ScrollArea>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
