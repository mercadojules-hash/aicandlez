import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Settings2,
  KeyRound,
  CheckCircle2,
  XCircle,
  Save,
  RotateCcw,
  Loader2,
  FlaskConical,
  Volume2,
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
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import {
  useVoiceSettings,
  useSetVoiceSettings,
  useVoiceOptions,
} from "@/hooks/useJarvisApi";

export default function VoiceSettings() {
  const { isAdmin } = useUserRole();
  const settings = useVoiceSettings();
  const setSettings = useSetVoiceSettings();
  const voices = useVoiceOptions();

  const data = settings.data;
  const [voiceIdDraft, setVoiceIdDraft] = useState("");

  // Hydrate the editable field from the resolved override (blank = use default).
  useEffect(() => {
    if (data) setVoiceIdDraft(data.voiceIdIsOverride ? data.voiceId : "");
  }, [data]);

  const hasApiKey = data?.hasApiKey ?? false;
  const resolvedVoiceId = data?.voiceId ?? "—";
  const defaultVoiceId = data?.defaultVoiceId ?? "—";
  const dirty = data ? voiceIdDraft.trim() !== (data.voiceIdIsOverride ? data.voiceId : "") : false;

  async function onToggleEnabled(next: boolean) {
    try {
      await setSettings.mutateAsync({ enabled: next });
      toast.success(next ? "Voice interface enabled." : "Voice interface disabled.");
    } catch {
      toast.error("Toggle failed — you may lack the required role.");
    }
  }

  async function onSaveVoiceId() {
    try {
      const res = await setSettings.mutateAsync({ voiceId: voiceIdDraft.trim() });
      toast.success(
        res.voiceIdIsOverride
          ? `Voice ID saved — using ${res.voiceId}.`
          : "Voice ID cleared — using the default voice.",
      );
    } catch {
      toast.error("Could not save the Voice ID.");
    }
  }

  async function onResetVoiceId() {
    setVoiceIdDraft("");
    try {
      await setSettings.mutateAsync({ voiceId: "" });
      toast.success("Reverted to the default voice.");
    } catch {
      toast.error("Could not reset the Voice ID.");
    }
  }

  const voiceList = voices.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Voice Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure the premium voice. Beyond an ElevenLabs API key and a
              Voice ID, no further setup is required.
            </p>
          </div>
        </div>
        <Link href="/voice-test">
          <Button variant="outline" size="sm" className="gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" /> Open Voice Test
          </Button>
        </Link>
      </div>

      {/* ── Provider status ─────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Provider</h2>
        </div>
        {settings.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card/40 p-4">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">ElevenLabs API key</div>
                <div className="text-xs text-muted-foreground">
                  Set via the <code>ELEVENLABS_API_KEY</code> environment secret.
                  Without it, Jarvis falls back to the browser voice.
                </div>
              </div>
              {hasApiKey ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-500"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> configured
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/30 bg-amber-500/10 font-mono text-amber-500"
                >
                  <XCircle className="h-3.5 w-3.5" /> not set
                </Badge>
              )}
            </div>

            {isAdmin ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-card/40 p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="vs-enabled" className="text-sm font-medium">
                    Voice interface
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Master switch for the executive voice surface.
                  </div>
                </div>
                <Switch
                  id="vs-enabled"
                  checked={data?.enabled ?? false}
                  disabled={setSettings.isPending}
                  onCheckedChange={onToggleEnabled}
                />
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* ── Voice ID ────────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Voice ID</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-card/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Active voice
            </div>
            <div className="mt-1 break-all font-mono text-sm">{resolvedVoiceId}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {data?.voiceIdIsOverride ? "custom override" : "default voice"}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Default voice
            </div>
            <div className="mt-1 break-all font-mono text-sm">{defaultVoiceId}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              from <code>ELEVENLABS_VOICE_ID</code> or built-in
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="vs-voiceid" className="text-sm">
            Custom Voice ID
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="vs-voiceid"
              value={voiceIdDraft}
              onChange={(e) => setVoiceIdDraft(e.target.value)}
              placeholder="Leave blank to use the default voice"
              className="font-mono"
            />
            <Button
              onClick={onSaveVoiceId}
              disabled={!dirty || setSettings.isPending}
              className="gap-1.5"
            >
              {setSettings.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
            <Button
              variant="outline"
              onClick={onResetVoiceId}
              disabled={setSettings.isPending || (!data?.voiceIdIsOverride && voiceIdDraft.trim() === "")}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste any ElevenLabs Voice ID from your account. Precedence: this
            setting &gt; <code>ELEVENLABS_VOICE_ID</code> env &gt; built-in
            default.
          </p>
        </div>

        {/* Voice library — clickable to fill the field */}
        {hasApiKey ? (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Your voice library
            </div>
            {voices.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : voiceList.length === 0 ? (
              <div className="rounded-md border border-border bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground">
                No voices returned. You can still paste a Voice ID above.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {voiceList.map((v) => {
                  const selected = v.voiceId === voiceIdDraft.trim();
                  return (
                    <button
                      key={v.voiceId}
                      type="button"
                      onClick={() => setVoiceIdDraft(v.voiceId)}
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
                      {v.description ? (
                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {v.description}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
