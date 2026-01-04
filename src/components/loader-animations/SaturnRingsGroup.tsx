"use client";

import React from "react";
import SaturnRing from "./SaturnRing";

interface SaturnRingsGroupProps {
  theme: "light" | "dark";
}

// Login page gradient colors
const loginGradientColors = [
  '#4f46e5',  // Indigo
  '#6d5dfc',  // Purple
  '#a855f7',  // Fuchsia
  '#f472b6',  // Pink
  '#6d5dfc',  // Purple (back)
  '#22c55e',  // Green
  '#7dd3fc',  // Cyan
  '#6d5dfc'   // Purple (final)
];

// Dark theme colors
const darkModeColors = [
  '#2E2257',  // Deep purple
  '#462559',  // Mid purple
  '#8A4374',  // Magenta
  '#5A48F9',  // Brand purple
  '#8B5CF6',  // Accent
  '#2563EB',  // Blue
  '#53A88A',  // Teal
  '#2E2257'   // Deep purple
];

const SaturnRingsGroup: React.FC<SaturnRingsGroupProps> = ({ theme }) => {
  const colors = theme === "light" ? loginGradientColors : darkModeColors;

  return (
    <group>
      {/* Ring 1: Outermost, slowest rotation */}
      <SaturnRing
        radius={3.5}
        tube={0.08}
        rotation={[0.2, 0, 0]}
        colors={colors}
        speed={0.8}
        opacity={0.8}
      />

      {/* Ring 2: Middle, medium speed */}
      <SaturnRing
        radius={2.8}
        tube={0.06}
        rotation={[0.4, 0.3, 0]}
        colors={colors}
        speed={1.2}
        opacity={0.65}
      />

      {/* Ring 3: Innermost, fastest rotation */}
      <SaturnRing
        radius={2.1}
        tube={0.04}
        rotation={[0.6, 0.6, 0]}
        colors={colors}
        speed={1.5}
        opacity={0.5}
      />
    </group>
  );
};

export default SaturnRingsGroup;