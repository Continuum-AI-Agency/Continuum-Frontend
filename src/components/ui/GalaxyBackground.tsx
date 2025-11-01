"use client";

import { memo, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "../theme-provider";

export type GalaxyBackgroundProps = {
  className?: string;
  /** Subtle animation intensity; 0 disables */
  intensity?: 0 | 1 | 2;
  /** Animation speed preset */
  speed?: "off" | "slow" | "glacial";
};

/**
 * GalaxyBackground renders layered, softly animated radial/linear gradients that
 * harmonize with the project's CSS variables in globals.css. Designed to sit
 * behind page content and be easy on the eyes in both light/dark themes.
 */
export const GalaxyBackground = memo(function GalaxyBackground({ className, intensity = 1, speed = "glacial" }: GalaxyBackgroundProps) {
  const { appearance } = useTheme();
  const duration = speed === "slow" ? 240 : speed === "glacial" ? 480 : 0;
  const transition = useMemo(
    () => ({ duration: duration || 1, repeat: Infinity, repeatType: "mirror" as const }),
    [duration]
  );
  const prefersReduced = useReducedMotion();
  const amplitude = intensity === 0 || speed === "off" ? 0 : intensity === 2 ? 14 : 8; // px shift; very subtle

  // Palette per appearance
  const isDark = appearance === "dark";
  // Use CSS variables to stabilize SSR/client style serialization
  const c1 = isDark ? "var(--bg-galaxy-c1-dark)" : "var(--bg-galaxy-c1-light)";
  const c2 = isDark ? "var(--bg-galaxy-c2-dark)" : "var(--bg-galaxy-c2-light)";
  const c3 = isDark ? "var(--bg-galaxy-c3-dark)" : "var(--bg-galaxy-c3-light)";
  const vignetteTint = isDark ? "var(--bg-galaxy-vignette-dark)" : "var(--bg-galaxy-vignette-light)";

  return (
    <div className={className ?? ""} aria-hidden>
      {/* Base background uses theme tokens */}
      <div className="pointer-events-none fixed inset-0 -z-10" style={{ background: "var(--background)" }} />

      {/* CSS layers (lightweight, motion optional) */}
      <motion.div
        className="pointer-events-none fixed inset-0 -z-10 opacity-30"
        style={{
          background:
            `radial-gradient(1200px 800px at 15% 20%, ${c1}, transparent 60%), ` +
            `radial-gradient(900px 700px at 85% 30%, ${c2}, transparent 60%), ` +
            `radial-gradient(1000px 900px at 50% 90%, ${c3}, transparent 60%)`,
          willChange: "transform",
        }}
        animate={prefersReduced || !amplitude ? undefined : { x: [-amplitude, amplitude, -amplitude], y: [0, -amplitude / 3, 0] }}
        transition={transition}
      />

      {/* Soft vignette and sweep overlay for depth */}
      <motion.div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            `radial-gradient(1200px 800px at 10% 110%, ${isDark ? "var(--bg-galaxy-c1-overlay-dark)" : "var(--bg-galaxy-c1-overlay-light)"}, transparent 70%), ` +
            `linear-gradient(115deg, ${vignetteTint}, rgba(0,0,0,0.00) 35%, ${isDark ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.04)"})`,
          mixBlendMode: "normal",
          willChange: "transform",
        }}
        animate={prefersReduced || !amplitude ? undefined : { rotate: [0, 1, -0.5, 0] }}
        transition={{ duration: 540, repeat: Infinity, repeatType: "mirror" }}
      />

      {/* Grain for subtle texture */}
      <div
        className="pointer-events-none fixed inset-0 -z-[11] opacity-[0.07] [background-image:radial-gradient(rgba(0,0,0,0.6)_1px,transparent_1px)] [background-size:3px_3px]"
      />
    </div>
  );
});

export default GalaxyBackground;
