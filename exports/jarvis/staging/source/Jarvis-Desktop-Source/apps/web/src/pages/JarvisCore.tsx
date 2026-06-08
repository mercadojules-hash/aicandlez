import React, { useState } from "react";
import JarvisOrb, { OrbState } from "@/components/core/JarvisOrb";
import VoiceConsole from "@/components/core/VoiceConsole";
import BusinessRegistry from "@/components/core/BusinessRegistry";
import IntelligencePanel from "@/components/core/IntelligencePanel";
import AicandlezPanel from "@/components/core/AicandlezPanel";

export default function JarvisCore() {
  const [orbState, setOrbState] = useState<OrbState>("idle");

  return (
    <div className="mx-auto w-full h-[calc(100vh-8rem)] max-w-[1400px] flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex-none">
        <h1 className="text-2xl font-bold tracking-tighter uppercase text-foreground">Command Center</h1>
        <p className="text-sm font-mono tracking-widest text-muted-foreground uppercase">Executive Operating System</p>
      </div>

      {/* Main Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr] gap-6">
        
        {/* Left Column: Businesses & AICandlez */}
        <div className="flex flex-col gap-6 min-h-0 overflow-y-auto custom-scrollbar pr-2">
          <BusinessRegistry className="flex-1" />
          <AicandlezPanel className="flex-1" />
        </div>

        {/* Center Column: Core Orb & Voice */}
        <div className="flex flex-col items-center justify-between gap-6 min-h-0">
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <JarvisOrb state={orbState} className="mb-8 scale-110" />
          </div>
          <VoiceConsole 
            onStateChange={setOrbState} 
            className="w-full max-h-[40%] shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.5)]" 
          />
        </div>

        {/* Right Column: Intelligence */}
        <div className="flex flex-col min-h-0 overflow-y-auto custom-scrollbar pl-2">
          <IntelligencePanel className="flex-1" />
        </div>

      </div>
    </div>
  );
}
