import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  AudioLines,
  Radio,
  Trash2,
  History,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  type JarvisVoiceSession,
  type JarvisVoiceTurnResult,
} from "@/hooks/useJarvisApi";

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
          must enable it before push-to-talk turns can be recorded. Voice is an
          input/output surface only — it never bypasses governance.
        </div>
      </div>
    </Card>
  );
}

function TurnResultCard({ result }: { result: JarvisVoiceTurnResult }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
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
        if (audioRef.current) {
          audioRef.current.src = url;
          void audioRef.current.play().catch(() => undefined);
        }
      } catch {
        /* ignore decode errors — text remains */
      }
    }
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [result.audioBase64, result.audioContentType]);

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
            <AudioLines className="mr-1 h-3 w-3" /> readback
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
      <audio ref={audioRef} controls className="h-8 w-full" />
    </Card>
  );
}

function SessionHistory({
  sessionId,
}: {
  sessionId: string;
}) {
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

  const enabled = settings.data?.enabled ?? false;

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<JarvisVoiceTurnResult | null>(null);
  const [recording, setRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
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

  async function startRecording() {
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

  function stopRecording() {
    if (!recording) return;
    setRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
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

  const processing = voiceTurn.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Voice</h1>
            <p className="text-sm text-muted-foreground">
              Executive push-to-talk. Read &amp; advisory only — transcripts are
              retained, audio is never stored.
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

      <Card className="space-y-5 p-6">
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            disabled={!enabled || processing || startSession.isPending}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={(e) => {
              e.preventDefault();
              void startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            className={cn(
              "flex h-28 w-28 items-center justify-center rounded-full border-2 transition-all",
              recording
                ? "scale-105 border-destructive bg-destructive/15 text-destructive shadow-lg shadow-destructive/20"
                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
              (!enabled || processing) && "cursor-not-allowed opacity-50",
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
          {activeSessionId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onEndSession}
              disabled={endSession.isPending}
            >
              End session
            </Button>
          ) : null}
        </div>
      </Card>

      {lastResult ? <TurnResultCard result={lastResult} /> : null}

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
