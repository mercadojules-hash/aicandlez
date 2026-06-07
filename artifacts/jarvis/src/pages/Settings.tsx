import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "@/hooks/useJarvisApi";
import { useUserRole } from "@/hooks/useUserRole";

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return fallback;
}

function asBool(v: unknown): boolean {
  return v === true || v === "true";
}

export default function Settings() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [orgName, setOrgName] = useState("");
  const [mission, setMission] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);

  useEffect(() => {
    if (!data) return;
    setOrgName(asString(data.orgName, "Jarvis Command Center"));
    setMission(asString(data.mission));
    setDigestEnabled(asBool(data.dailyDigest));
  }, [data]);

  async function save() {
    try {
      await update.mutateAsync({
        orgName,
        mission,
        dailyDigest: digestEnabled,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  }

  const canEdit = isAdmin;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your command center.
          </p>
        </div>
        {!roleLoading && !canEdit ? (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
            Read-only · admin required
          </Badge>
        ) : null}
      </div>

      <Card className="p-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                value={orgName}
                disabled={!canEdit}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mission">Mission statement</Label>
              <Textarea
                id="mission"
                value={mission}
                disabled={!canEdit}
                placeholder="What is this command center for?"
                onChange={(e) => setMission(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="digest">Daily digest</Label>
                <p className="text-xs text-muted-foreground">
                  Summarize portfolio activity each day.
                </p>
              </div>
              <Switch
                id="digest"
                checked={digestEnabled}
                disabled={!canEdit}
                onCheckedChange={setDigestEnabled}
              />
            </div>
            {canEdit ? (
              <div className="flex justify-end">
                <Button onClick={save} disabled={update.isPending}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {update.isPending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
