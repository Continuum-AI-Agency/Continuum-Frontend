"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DEFAULT_LOADING_PHRASES } from "@/lib/ui/loadingPhrases";

interface CSSFallbackProps {
  phrases?: string[];
  cycleDuration?: number;
  theme?: "light" | "dark";
}

// CSS-only wave animation using login.module.css classes
const CSSFallback: React.FC<CSSFallbackProps> = ({
  phrases = DEFAULT_LOADING_PHRASES,
  cycleDuration = 2500,
  theme = "dark"
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const transitionDuration = Math.min(0.6, Math.max(0.25, cycleDuration / 1000 * 0.6));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % phrases.length);
    }, cycleDuration);

    return () => clearInterval(interval);
  }, [phrases.length, cycleDuration]);

  const variants = {
    enter: {
      opacity: 0,
      y: 30,
      scale: 0.9
    },
    center: {
      opacity: 1,
      y: 0,
      scale: 1
    },
    exit: {
      opacity: 0,
      y: -30,
      scale: 0.9
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Background gradient from login page */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(315deg, #4f46e5 0%, #6d5dfc 18%, #a855f7 32%, #f472b6 46%, #6d5dfc 58%, #22c55e 70%, #7dd3fc 82%, #6d5dfc 100%)",
          backgroundSize: "400% 400%",
          animation: "loginGradient 18s ease infinite"
        }}
      />

      {/* CSS wave layers */}
      <div
        className="absolute bottom-0 left-0 w-full h-36 opacity-80"
        style={{
          background: "linear-gradient(90deg, rgba(255, 255, 255, 0.28), rgba(79, 70, 229, 0.24), rgba(168, 85, 247, 0.20), rgba(34, 197, 94, 0.18), rgba(125, 211, 252, 0.16))",
          borderRadius: "1000% 1000% 0 0",
          animation: "loginWave 16s -3s linear infinite",
          transform: "translate3d(0, 0, 0)"
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-full h-36 opacity-65"
        style={{
          background: "linear-gradient(90deg, rgba(255, 255, 255, 0.28), rgba(79, 70, 229, 0.24), rgba(168, 85, 247, 0.20), rgba(34, 197, 94, 0.18), rgba(125, 211, 252, 0.16))",
          borderRadius: "1000% 1000% 0 0",
          animation: "loginWave 22s linear reverse infinite",
          transform: "translate3d(0, 0, 0)",
          bottom: "-2.8rem"
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-full h-36 opacity-50"
        style={{
          background: "linear-gradient(90deg, rgba(255, 255, 255, 0.28), rgba(79, 70, 229, 0.24), rgba(168, 85, 247, 0.20), rgba(34, 197, 94, 0.18), rgba(125, 211, 252, 0.16))",
          borderRadius: "1000% 1000% 0 0",
          animation: "loginWave 26s -1s linear infinite",
          transform: "translate3d(0, 0, 0)",
          bottom: "-5.4rem"
        }}
      />

      {/* Phrase overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <AnimatePresence mode="wait">
          <motion.h1
            key={phrases[currentIndex]}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: transitionDuration, ease: "easeInOut" }}
            className={cn(
              "text-5xl md:text-7xl font-bold text-center tracking-tight drop-shadow-2xl",
              theme === "dark"
                ? "text-white drop-shadow-[0_0_30px_rgba(139,92,246,0.5)]"
                : "text-primary drop-shadow-lg"
            )}
          >
            {phrases[currentIndex]}
          </motion.h1>
        </AnimatePresence>
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes loginGradient {
          0% {
            background-position: 0% 0%;
          }
          50% {
            background-position: 100% 100%;
          }
          100% {
            background-position: 0% 0%;
          }
        }

        @keyframes loginWave {
          0% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-25%);
          }
          50% {
            transform: translateX(-50%);
          }
          75% {
            transform: translateX(-25%);
          }
          100% {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default CSSFallback;
