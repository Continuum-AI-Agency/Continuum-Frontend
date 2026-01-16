"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import SaturnRingsScene from "./SaturnRingsScene";
import PhraseOverlay from "./PhraseOverlay";
import CSSFallback from "./CSSFallback";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { LOGIN_GLOW_GRADIENT } from "@/lib/ui/backgrounds";
import { DEFAULT_LOADING_PHRASES } from "@/lib/ui/loadingPhrases";

export interface OnboardingLoadingProps {
  /** Phrases to cycle through */
  phrases?: string[];
  /** Duration between phrase changes (ms) */
  cycleDuration?: number;
  /** Force use 3D version (true) or CSS fallback (false) */
  use3D?: boolean;
  /** Control visibility externally */
  isVisible?: boolean;
  /** Callback when ready to fade out */
  onReady?: () => void;
  /** Auto-fade in on mount */
  autoFadeIn?: boolean;
  /** Auto-fade out when onReady called */
  autoFadeOut?: boolean;
  /** Show floating particles */
  showParticles?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg" | "full";
  /** Full-screen overlay */
  overlay?: boolean;
  /** Enable fast 600ms phrase cycling */
  fastMode?: boolean;
  /** Extra class names for the container */
  className?: string;
}

const OnboardingLoading: React.FC<OnboardingLoadingProps> = ({
  phrases = DEFAULT_LOADING_PHRASES,
  cycleDuration = 2500,
  use3D = true,
  isVisible = true,
  onReady,
  autoFadeIn = true,
  autoFadeOut = true,
  showParticles = true,
  size = "full",
  overlay = true,
  fastMode = false,
  className,
}) => {
  const { appearance } = useTheme();
  const [internalVisible, setInternalVisible] = useState(autoFadeIn ? false : isVisible);
  const [webGLSupported, setWebGLSupported] = useState<boolean | null>(null);

  // Check WebGL support
  useEffect(() => {
    const checkWebGL = () => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        setWebGLSupported(!!gl);
      } catch {
        setWebGLSupported(false);
      }
    };

    checkWebGL();
  }, []);

  // Handle visibility changes (fade in/out)
  useEffect(() => {
    if (isVisible) {
      if (autoFadeIn) {
        setInternalVisible(true);
      } else {
        setInternalVisible(isVisible);
      }
      return;
    }

    if (autoFadeOut) {
      setInternalVisible(false);
    } else {
      setInternalVisible(isVisible);
    }
  }, [isVisible, autoFadeIn, autoFadeOut]);

  // Handle ready callback
  useEffect(() => {
    if (onReady && autoFadeOut) {
      const cleanup = () => {
        setInternalVisible(false);
      };

      // Call onReady and then fade out
      onReady();
      cleanup();
    }
  }, [onReady, autoFadeOut]);

  // Determine if we should show 3D or fallback
  const shouldUse3D = use3D && webGLSupported === true;

  const containerClasses = overlay
    ? "fixed inset-0 z-50 bg-default overflow-hidden"
    : size === "full" ? "absolute inset-0"
    : size === "lg" ? "w-full h-96"
    : size === "md" ? "w-full h-64"
    : "w-full h-48";

  const backdropStyle = overlay ? { backgroundImage: LOGIN_GLOW_GRADIENT } : undefined;

  return (
    <motion.div
      className={cn(containerClasses, className)}
      style={backdropStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: internalVisible ? 1 : 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      onAnimationComplete={(definition) => {
        if (definition === 'exit' && !internalVisible) {
          // Fade out complete
        }
      }}
    >
      {shouldUse3D ? (
        <SaturnRingsScene
          theme={appearance}
          showParticles={showParticles}
          size={size}
        />
      ) : (
        <CSSFallback phrases={phrases} cycleDuration={cycleDuration} />
      )}

      <PhraseOverlay
        phrases={phrases}
        cycleDuration={cycleDuration}
        theme={appearance}
        fastMode={fastMode}
      />
    </motion.div>
  );
};

export default OnboardingLoading;
