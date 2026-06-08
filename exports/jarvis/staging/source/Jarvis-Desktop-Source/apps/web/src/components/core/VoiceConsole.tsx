import React, { useState, useEffect, useRef } from "react";
import { Mic, Send, Square, Command, Activity, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrbState } from "./JarvisOrb";
import {
  useStartVoiceSession,
  useVoiceTextTurn,
  useSessionTurns,
} from "@/hooks/useJarvisApi";
import { toast } from "sonner";

export default function VoiceConsole({
  onStateChange,
  className
}: {
  onStateChange: (state: OrbState) => void;
  className?: string;
}) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  
  const startSession = useStartVoiceSession();
  const textTurn = useVoiceTextTurn();
  
  const { data: turnsData } = useSessionTurns(activeSessionId ?? "");

  const ensureSession = async () => {
    if (activeSessionId) return activeSessionId;
    try {
      const res = await startSession.mutateAsync(null);
      setActiveSessionId(res.session.id);
      return res.session.id;
    } catch {
      toast.error("Could not start a voice session.");
      return null;
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const sid = await ensureSession();
    if (!sid) return;

    onStateChange("thinking");
    try {
      await textTurn.mutateAsync({
        sessionId: sid,
        transcript: inputText,
        source: "text",
      });
      setInputText("");
      onStateChange("speaking");
      setTimeout(() => onStateChange("idle"), 2000);
    } catch {
      toast.error("Command failed.");
      onStateChange("alert");
      setTimeout(() => onStateChange("idle"), 2000);
    }
  };

  const turns = turnsData?.turns ?? [];

  return (
    <Card className={cn("flex flex-col border-border/40 bg-card/40 backdrop-blur-md overflow-hidden", className)}>
      <div className="flex h-10 items-center justify-between border-b border-border/40 bg-muted/20 px-4">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Command Feed
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {turns.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground font-mono mt-8 opacity-50">
              Awaiting executive input...
            </div>
          ) : (
            turns.map((t) => (
              <div key={t.id} className="space-y-2 text-sm">
                <div className="flex items-center justify-end">
                  <div className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-l-lg rounded-tr-lg max-w-[85%] font-mono text-xs">
                    {t.transcript || "(No transcript)"}
                  </div>
                </div>
                <div className="flex items-center justify-start">
                  <div className="bg-muted/30 border border-border/50 text-foreground px-3 py-2 rounded-r-lg rounded-tl-lg max-w-[85%] font-sans">
                    {t.replyText}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border/40 bg-muted/10">
        <form
          className="relative flex items-center"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <Command className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={textTurn.isPending}
            placeholder="Executive command..."
            className="pl-9 pr-12 h-10 bg-background/50 border-border/50 font-mono text-xs rounded-md shadow-inner"
          />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={!inputText.trim() || textTurn.isPending}
            className="absolute right-1 h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/20"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
