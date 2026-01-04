"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface PhraseOverlayProps {
  phrases?: string[];
  cycleDuration?: number;
  theme?: "light" | "dark";
  fastMode?: boolean; // Enable 600ms cycling during transitions
}

const PhraseOverlay: React.FC<PhraseOverlayProps> = ({
  phrases = ["Hola", "Hello", "Welcome", "Bienvideo", "Olà", "Bem-vindo"],
  cycleDuration = 2500,
  theme = "dark",
  fastMode = false
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const intervalDuration = fastMode ? 600 : cycleDuration;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % phrases.length);
    }, intervalDuration);

    return () => clearInterval(interval);
  }, [phrases.length, cycleDuration, fastMode]);

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
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <AnimatePresence mode="wait">
        <motion.h1
          key={phrases[currentIndex]}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.7, ease: "easeInOut" }}
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
  );
};

export default PhraseOverlay;