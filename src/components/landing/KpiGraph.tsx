"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Box, Text } from "@radix-ui/themes";

const points = [
  { x: 12, y: 140, label: "Baseline" },
  { x: 72, y: 118, label: "Unified" },
  { x: 132, y: 96, label: "Automate" },
  { x: 192, y: 70, label: "Optimize" },
  { x: 252, y: 46, label: "Alerting" },
  { x: 312, y: 28, label: "Continuum" },
];

const glowGradient = `radial-gradient(circle at 60% 20%, rgba(130, 102, 255, 0.45), transparent 55%),
  radial-gradient(circle at 30% 80%, rgba(99, 253, 207, 0.35), transparent 60%)`;

export function KpiGraph() {
  const path = useMemo(() => {
    return points.reduce((acc, point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }
      const prev = points[index - 1];
      const controlX = (prev.x + point.x) / 2;
      return `${acc} C ${controlX} ${prev.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
    }, "");
  }, []);

  return (
    <Box className="rounded-3xl border border-white/30 bg-slate-950/70 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10" style={{ backgroundImage: glowGradient }}>
      <div className="flex items-center justify-between">
        <Text size="2" color="gray" className="uppercase tracking-[0.35em] text-slate-300">
          Kpi lift
        </Text>
        <Text size="2" color="gray" className="text-slate-400">
          Up and to the right
        </Text>
      </div>
      <div className="relative mt-4 h-48 w-full">
        <motion.svg
          viewBox="0 0 324 180"
          className="h-full w-full overflow-visible"
          initial="hidden"
          animate="visible"
        >
          <defs>
            <linearGradient id="graphStroke" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(139, 92, 246, 0.85)" />
              <stop offset="60%" stopColor="rgba(99, 253, 207, 0.9)" />
              <stop offset="100%" stopColor="rgba(244, 114, 182, 0.95)" />
            </linearGradient>
            <linearGradient id="graphFill" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(129, 140, 248, 0.35)" />
              <stop offset="100%" stopColor="rgba(129, 140, 248, 0.0)" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="12" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <motion.path
            d={`${path} L 320 180 L 0 180 Z`}
            fill="url(#graphFill)"
            initial={{ opacity: 0, pathLength: 0 }}
            animate={{ opacity: 1, pathLength: 1 }}
            transition={{ duration: 1.8, ease: "easeOut" }}
          />

          <motion.path
            d={path}
            stroke="url(#graphStroke)"
            strokeWidth={3.2}
            strokeLinecap="round"
            fill="none"
            filter="url(#glow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
          />

          {points.map((point, index) => (
            <motion.g
              key={point.label}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6 + index * 0.12, type: "spring", stiffness: 280, damping: 18 }}
            >
              <circle cx={point.x} cy={point.y} r={5} fill="rgba(255, 255, 255, 0.95)" />
              <circle cx={point.x} cy={point.y} r={10} fill="rgba(139, 92, 246, 0.25)" />
              <text x={point.x + 12} y={point.y - 12} className="fill-white text-xs font-semibold">
                {point.label}
              </text>
            </motion.g>
          ))}
        </motion.svg>
        <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/10" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-slate-300">
        <div>
          <p className="font-semibold text-white">90% faster</p>
          <p className="text-slate-400">Organic content velocity</p>
        </div>
        <div>
          <p className="font-semibold text-white">5 min onboarding</p>
          <p className="text-slate-400">All channels connected</p>
        </div>
        <div>
          <p className="font-semibold text-white">1 command center</p>
          <p className="text-slate-400">Paid + organic alignment</p>
        </div>
      </div>
    </Box>
  );
}

export default KpiGraph;
