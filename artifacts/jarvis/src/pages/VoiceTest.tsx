import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  FlaskConical,
  Play,
  Loader2,
  Settings2,
  CheckCircle2,
  XCircle,
  Timer,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { JarvisOrb, type OrbState } from "@/components/voice/JarvisOrb";
import {
  useVoiceSettings,
  useVoiceOptions,
  useVoiceTest,
} from "@/hooks/useJarvisApi";

const SAMPLE_TEXT =
  "Good evening. All systems are nominal and standing by for your command.";

export default function VoiceTest() {
  const settings = useVoiceSettings();
  const voices = useVoiceOptions();
  const test = useVoiceTest();

  const hasApiKey = settings.data?.hasApiKey ?? false;
  const resolvedVoiceId = settings.data?.voiceId ?? "";

  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [text, setText] = useState(SAMPLE_TEXT);
  const [speaking, setSpeaking] = useState(false);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Default the picker to the currently-active voice once settings load.
  useEffect(() => {
    if (resolvedVoiceId && !selectedVoiceId) setSelectedVoiceId(resolvedVoiceId);
  }, [resolvedVoiceId, selectedVoiceId]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function onSynthesize() {
    const body = text.trim();
    if (!body || test.isPending) return;
    setLastLatency(null);
    try {
      const res = await test.mutateAsync({
        text: body,
        voiceId: selectedVoiceId.trim() || undefined,
      });
      setLastLatency(res.latencyMs);
      if (!res.ok || !res.audioBase64 || !res.audioContentType) {
        toast.error(
          res.error
            ? `Synthesis failed: ${res.error}`
            : "Synthesis failed — check the API key and Voice ID.",
        );
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.audioContentType });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const el = audioElRef.current;
      if (el) {
        el.src = url;
        el.onended = () => setSpeaking(false);
        await el.play();
        setSpeaking(true);
      }
      toast.success(`Synthesized in ${res.latencyMs}ms.`);
    } catch {
      toast.error("Voice test failed.");
    }
  }

  const orbState: OrbState = !hasApiKey
    ? "disabled"
    : test.isPending
      ? "processing"
      : speaking
        ? "speaking"
        : "idle";

  const voiceList = voices.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <audio ref={audioElRef} className="hidden" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Voice Test</h1>
            <p className="text-sm text-muted-foreground">
              Audition any voice in your library before committing it as the
              executive voice.
            </p>
          </div>
        </div>
        <Link href="/voice-settings">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Voice Settings
          </Button>
        </Link>
      </div>

      {!hasApiKey ? (
        <Card className="flex items-center gap-3 border-amber-500/30 bg-amber-500/5 p-4">
          <XCircle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-xs text-muted-foreground">
            No ElevenLabs API key is configured. Set{" "}
            <code>ELEVENLABS_API_KEY</code> to audition premium voices. Browser
            speech remains available on the Voice page.
          </div>
        </Card>
      ) : null}

      <Card className="relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="relative flex flex-col items-center gap-4">
          <JarvisOrb state={orbState} size={200} />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {hasApiKey ? (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-500"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> key configured
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/30 bg-amber-500/10 font-mono text-amber-500"
              >
                <XCircle className="h-3.5 w-3.5" /> no key
              </Badge>
            )}
            {lastLatency != null ? (
              <Badge variant="outline" className="gap-1 font-mono text-muted-foreground">
                <Timer className="h-3.5 w-3.5" /> {lastLatency}ms
              </Badge>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="vt-text" className="text-sm">
            Sample text
          </Label>
          <Textarea
            id="vt-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Type the line for Jarvis to speak…"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Voice</Label>
          </div>
          {voices.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : voiceList.length === 0 ? (
            <div className="rounded-md border border-border bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground">
              {hasApiKey
                ? "No voices returned — the active voice will be used."
                : "Connect an API key to list your voices."}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {voiceList.map((v) => {
                const selected = v.voiceId === selectedVoiceId;
                return (
                  <button
                    key={v.voiceId}
                    type="button"
                    onClick={() => setSelectedVoiceId(v.voiceId)}
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors",
                      selected
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-card/40 hover:border-primary/30 hover:bg-primary/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{v.name}</span>
                      {v.category ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {v.category}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                      {v.voiceId}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Button
          onClick={onSynthesize}
          disabled={test.isPending || text.trim().length === 0}
          className="w-full gap-1.5"
        >
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Synthesize &amp; play
        </Button>
      </Card>
    </div>
  );
}
