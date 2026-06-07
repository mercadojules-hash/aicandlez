import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Square,
  AudioLines,
  Radio,
  Trash2,
  History,
  ShieldAlert,
  Loader2,
  Send,
  Keyboard,
  Cloud,
  MonitorSmartphone,
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
  speakBrowser,
  cancelBrowserSpeech,
  type BrowserRecognizer,
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
  enableBrowserTts,
}: {
  result: JarvisVoiceTurnResult;
  enableBrowserTts: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  // Read back exactly once per turn — guard against incidental re-renders that
  // would otherwise replay (or overlap) the spoken response.
  const spokenTurnRef = useRef<string | null>(null);

  useEffect(() => {
    if (spokenTurnRef.current === result.turnId) return;
    spokenTurnRef.current = result.turnId;

    // Stop any in-flight readback (audio element + browser speech) before the
    // new turn plays, so rapid successive turns never overlap or stutter.
    cancelBrowserSpeech();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    if (result.audioBase64 && result.audioContentType) {
      // Premium provider returned synthesized audio — play it verbatim.
      try {
        const bytes = Uint8Array.from(atob(result.audioBase64), (c) =>
          c.charCodeAt(0),
        );
        const blob = new Blob([bytes], { type: result.audioContentType });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        if (audioRef.current) {
          audioRef.current.src = url;
          void audioRef.current.play().catch(() => undefined);
        }
      } catch {
        /* ignore decode errors — text remains */
      }
    } else if (enableBrowserTts && result.replyText.trim()) {
      // No server audio — read back with the browser's British voice.
      speakBrowser(result.replyText);
    }
  }, [
    result.turnId,
    result.audioBase64,
    result.audioContentType,
    result.replyText,
    enableBrowserTts,
  ]);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      cancelBrowserSpeech();
    };
  }, []);

  const spokenInBrowser = !result.audioBase64 && enableBrowserTts;

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

      {/* hidden element drives autoplay; controls let the executive replay */}
      {result.audioBase64 ? (
        <audio ref={audioRef} controls className="h-8 w-full" />
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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<JarvisVoiceTurnResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [textValue, setTextValue] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognizerRef = useRef<BrowserRecognizer | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      recognizerRef.current?.abort();
      cancelBrowserSpeech();
    };
  }, []);

  async function onToggleEnabled(next: boolean) {
    try {
      await setSettings.mutateAsync(next);
      toast.success(next ? "Voice interface enabled." : "Voice interface disabled.");
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

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

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
        setLastResult(result);
        if (result.status !== "ok") {
          toast.message("Turn completed with a degraded result.", {
            description: result.replyText.slice(0, 120),
          });
        }
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

  // ── Browser STT: transcribe in-browser, send text turn ──────────────────────
  async function startBrowserListening() {
    if (!enabled || recording) return;
    const sessionId = await ensureSession();
    if (!sessionId) return;

    cancelBrowserSpeech();
    const recognizer = startBrowserRecognition({
      lang: "en-GB",
      onResult: async (transcript) => {
        try {
          const result = await textTurn.mutateAsync({
            sessionId,
            transcript,
            source: "browser-stt",
          });
          setLastResult(result);
          if (result.status !== "ok") {
            toast.message("Turn completed with a degraded result.", {
              description: result.replyText.slice(0, 120),
            });
          }
        } catch {
          toast.error("Voice turn failed.");
        }
      },
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

  // ── Press handlers dispatch by input mode ───────────────────────────────────
  function onPressStart() {
    if (inputMode === "server") void startServerRecording();
    else if (inputMode === "browser") void startBrowserListening();
  }
  function onPressEnd() {
    if (inputMode === "server") stopServerRecording();
    else if (inputMode === "browser") stopBrowserListening();
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

  const processing = voiceTurn.isPending || textTurn.isPending;
  const isVoiceMode = inputMode === "browser" || inputMode === "server";
  const pttDisabled =
    !enabled || processing || startSession.isPending || (inputMode === "server" && !caps.mic);

  const modeButtons: { mode: InputMode; label: string; icon: typeof Mic; available: boolean }[] = [
    { mode: "browser", label: "Browser voice", icon: Mic, available: caps.browserStt },
    { mode: "server", label: "Premium voice", icon: Cloud, available: caps.mic },
    { mode: "text", label: "Text", icon: Keyboard, available: true },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
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

        {isAdmin ? (
          <Card className="flex items-center gap-3 px-4 py-3">
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

      {!enabled ? <VoiceDisabledBanner /> : null}

      {/* Provider / input-mode selector */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <MonitorSmartphone className="ml-1 h-4 w-4 text-muted-foreground" />
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
        <span className="ml-auto mr-1 text-[10px] text-muted-foreground">
          {inputMode === "server"
            ? "Premium speech (ElevenLabs) — falls back to text when unconfigured"
            : inputMode === "browser"
              ? caps.browserTts
                ? "Browser speech · British readback"
                : "Browser speech · text readback"
              : "Type a command — always available"}
        </span>
      </Card>

      <Card className="space-y-5 p-6">
        {isVoiceMode ? (
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              disabled={pttDisabled}
              onMouseDown={onPressStart}
              onMouseUp={onPressEnd}
              onMouseLeave={onPressEnd}
              onTouchStart={(e) => {
                e.preventDefault();
                onPressStart();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                onPressEnd();
              }}
              className={cn(
                "flex h-28 w-28 items-center justify-center rounded-full border-2 transition-all",
                recording
                  ? "scale-105 border-destructive bg-destructive/15 text-destructive shadow-lg shadow-destructive/20"
                  : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
                pttDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {processing ? (
                <Loader2 className="h-10 w-10 animate-spin" />
              ) : recording ? (
                <Square className="h-9 w-9" />
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </button>
            <div className="text-center">
              <div className="text-sm font-medium">
                {processing
                  ? "Processing…"
                  : recording
                    ? "Listening — release to send"
                    : "Hold to talk"}
              </div>
              <div className="text-xs text-muted-foreground">
                {activeSessionId
                  ? `Session ${activeSessionId.slice(0, 8)}`
                  : "A session starts on your first turn"}
              </div>
            </div>
          </div>
        ) : null}

        {/* Text command — shown in text mode, and offered as a quick fallback
            under the mic so the executive can always type. */}
        <div className={cn("flex items-center gap-2", isVoiceMode && "pt-1")}>
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
        <TurnResultCard result={lastResult} enableBrowserTts={caps.browserTts} />
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
