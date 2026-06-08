import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "alert";

export default function JarvisOrb({ state = "idle", className }: { state?: OrbState; className?: string }) {
  const getOuterVariants = (s: OrbState) => {
    switch (s) {
      case "listening":
        return {
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
          boxShadow: [
            "0 0 20px rgba(0, 255, 255, 0.4)",
            "0 0 40px rgba(0, 255, 255, 0.8)",
            "0 0 20px rgba(0, 255, 255, 0.4)",
          ],
        };
      case "thinking":
        return {
          scale: [1, 0.95, 1.05, 1],
          opacity: [0.7, 0.9, 0.7],
          rotate: [0, 180, 360],
          boxShadow: "0 0 30px rgba(0, 255, 255, 0.6)",
        };
      case "speaking":
        return {
          scale: [1, 1.2, 0.9, 1.1, 1],
          opacity: [0.8, 1, 0.8],
          boxShadow: [
            "0 0 20px rgba(0, 255, 255, 0.5)",
            "0 0 60px rgba(0, 255, 255, 0.9)",
            "0 0 20px rgba(0, 255, 255, 0.5)",
          ],
        };
      case "alert":
        return {
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
          boxShadow: [
            "0 0 20px rgba(255, 50, 50, 0.6)",
            "0 0 50px rgba(255, 50, 50, 1)",
            "0 0 20px rgba(255, 50, 50, 0.6)",
          ],
        };
      case "idle":
      default:
        return {
          scale: [1, 1.02, 1],
          opacity: [0.6, 0.8, 0.6],
          boxShadow: [
            "0 0 15px rgba(0, 200, 255, 0.3)",
            "0 0 25px rgba(0, 200, 255, 0.5)",
            "0 0 15px rgba(0, 200, 255, 0.3)",
          ],
        };
    }
  };

  const getTransition = (s: OrbState) => {
    switch (s) {
      case "listening": return { duration: 1.5, repeat: Infinity, ease: "easeInOut" as const };
      case "thinking": return { duration: 2, repeat: Infinity, ease: "linear" as const };
      case "speaking": return { duration: 0.5, repeat: Infinity, ease: "easeInOut" as const };
      case "alert": return { duration: 0.8, repeat: Infinity, ease: "easeInOut" as const };
      case "idle":
      default: return { duration: 4, repeat: Infinity, ease: "easeInOut" as const };
    }
  };

  const isAlert = state === "alert";

  return (
    <div className={cn("relative flex items-center justify-center h-48 w-48", className)}>
      <motion.div
        className="absolute inset-0 rounded-full border border-primary/30"
        animate={getOuterVariants(state)}
        transition={getTransition(state)}
        style={{
          background: isAlert 
            ? "radial-gradient(circle, rgba(255,50,50,0.2) 0%, rgba(255,50,50,0.05) 70%, transparent 100%)"
            : "radial-gradient(circle, rgba(0,255,255,0.2) 0%, rgba(0,255,255,0.05) 70%, transparent 100%)",
          borderColor: isAlert ? "rgba(255, 50, 50, 0.3)" : "rgba(0, 255, 255, 0.3)",
        }}
      />
      <motion.div
        className="absolute h-32 w-32 rounded-full border-2 border-primary/50"
        animate={{
          rotate: state === "thinking" ? -360 : (state === "speaking" ? 180 : 0),
          scale: state === "speaking" ? [1, 1.1, 1] : 1,
        }}
        transition={{
          rotate: { duration: 3, repeat: Infinity, ease: "linear" },
          scale: { duration: 0.5, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{
          borderColor: isAlert ? "rgba(255,50,50,0.6)" : "rgba(0,255,255,0.4)",
          borderStyle: "dashed",
        }}
      />
      <motion.div
        className="absolute h-16 w-16 rounded-full"
        animate={{
          scale: isAlert ? [1, 1.2, 1] : [1, 1.05, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={getTransition(state)}
        style={{
          background: isAlert ? "rgba(255,50,50,0.8)" : "rgba(0,255,255,0.8)",
          boxShadow: isAlert ? "0 0 20px rgba(255,50,50,1)" : "0 0 20px rgba(0,255,255,1)",
        }}
      />
    </div>
  );
}
