import { useGetSettings, useUpdateSettings, useToggleKillSwitch, getGetSettingsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ShieldAlert, Settings2 } from "lucide-react";
import { useState, useEffect } from "react";

export function RiskControls() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const toggleKillSwitch = useToggleKillSwitch();

  const [localSettings, setLocalSettings] = useState({
    allocation: 20,
    stopLossPercent: 2,
    takeProfitPercent: 4,
    maxTradesPerDay: 5,
    minConfidence: 80,
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        allocation: settings.allocation,
        stopLossPercent: settings.stopLossPercent,
        takeProfitPercent: settings.takeProfitPercent,
        maxTradesPerDay: settings.maxTradesPerDay,
        minConfidence: settings.minConfidence,
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      { data: localSettings },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        }
      }
    );
  };

  const handleAutoMode = (checked: boolean) => {
    updateSettings.mutate(
      { data: { autoMode: checked } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }
      }
    );
  };

  const handleKillSwitch = () => {
    const newActive = !settings?.killSwitch;
    toggleKillSwitch.mutate(
      { data: { active: newActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }
      }
    );
  };

  if (isLoading || !settings) {
    return (
      <Card className="border-border/50 bg-[#0B0F14]/80 backdrop-blur">
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-[#0B0F14]/80 backdrop-blur">
      <CardHeader className="py-3 px-4 border-b border-border/50">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-secondary" />
          Risk Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Allocation ($)</Label>
            <Input
              type="number"
              value={localSettings.allocation}
              onChange={(e) => setLocalSettings(s => ({ ...s, allocation: Number(e.target.value) }))}
              className="h-8 text-sm font-mono bg-muted/20 border-border/50"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Stop Loss (%)</Label>
            <Input
              type="number"
              value={localSettings.stopLossPercent}
              onChange={(e) => setLocalSettings(s => ({ ...s, stopLossPercent: Number(e.target.value) }))}
              className="h-8 text-sm font-mono bg-muted/20 border-border/50"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Take Profit (%)</Label>
            <Input
              type="number"
              value={localSettings.takeProfitPercent}
              onChange={(e) => setLocalSettings(s => ({ ...s, takeProfitPercent: Number(e.target.value) }))}
              className="h-8 text-sm font-mono bg-muted/20 border-border/50"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max Trades/Day</Label>
            <Input
              type="number"
              value={localSettings.maxTradesPerDay}
              onChange={(e) => setLocalSettings(s => ({ ...s, maxTradesPerDay: Number(e.target.value) }))}
              className="h-8 text-sm font-mono bg-muted/20 border-border/50"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Min Confidence for Auto Trade (%)</Label>
          <Input
            type="number"
            value={localSettings.minConfidence}
            onChange={(e) => setLocalSettings(s => ({ ...s, minConfidence: Number(e.target.value) }))}
            className="h-8 text-sm font-mono bg-muted/20 border-border/50"
          />
        </div>

        <Button size="sm" variant="outline" onClick={handleSave} disabled={updateSettings.isPending} className="w-full text-xs">
          {updateSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>

        <div className="border-t border-border/50 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto Mode</Label>
              <p className="text-xs text-muted-foreground">Execute when rules met</p>
            </div>
            <Switch
              checked={settings.autoMode}
              onCheckedChange={handleAutoMode}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Live Trading</span>
            <span className="font-bold text-destructive">DISABLED</span>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleKillSwitch}
          className={`w-full font-bold uppercase tracking-wider ${
            settings.killSwitch
              ? "border-destructive/50 bg-destructive/10 text-destructive shadow-[0_0_15px_rgba(239,68,68,0.3)]"
              : "border-border/50 text-muted-foreground"
          }`}
        >
          <ShieldAlert className="w-4 h-4 mr-2" />
          {settings.killSwitch ? "Kill Switch: ACTIVE" : "Kill Switch: OFF"}
        </Button>

        {settings.killSwitch && (
          <div className="text-xs text-destructive text-center animate-pulse font-bold">
            ALL TRADING HALTED
          </div>
        )}
      </CardContent>
    </Card>
  );
}
