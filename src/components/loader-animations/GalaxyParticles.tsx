"use client";

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface GalaxyParticlesProps {
  theme: "light" | "dark";
  count?: number;
}

// Galaxy parameters for spiral generation
const galaxyParams = {
  count: 2500,
  radius: 8,
  branches: 3,
  spin: 1,
  randomness: 0.2,
  randomnessPower: 3,
};

const GalaxyParticles: React.FC<GalaxyParticlesProps> = ({
  theme,
  count = galaxyParams.count
}) => {
  const pointsRef = useRef<THREE.Points>(null);

  // Theme colors
  const galaxyColors = useMemo(() => {
    return theme === "light"
      ? { inside: "#5A48F9", outside: "#1b3984" } // Brand colors
      : { inside: "#8B5CF6", outside: "#2E2257" }; // Accent colors
  }, [theme]);

  // Generate spiral galaxy particles
  const particleData = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const radius = Math.random() * galaxyParams.radius;
      const spinAngle = radius * galaxyParams.spin;
      const branchAngle = (i % galaxyParams.branches) / galaxyParams.branches * Math.PI * 2;

      const randomX = Math.pow(Math.random(), galaxyParams.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) * galaxyParams.randomness * radius;
      const randomY = Math.pow(Math.random(), galaxyParams.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) * galaxyParams.randomness * radius;
      const randomZ = Math.pow(Math.random(), galaxyParams.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) * galaxyParams.randomness * radius;

      positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
      positions[i3 + 1] = randomY;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

      // Color gradient from inside to outside
      const mixedColor = new THREE.Color().lerpColors(
        new THREE.Color(galaxyColors.inside),
        new THREE.Color(galaxyColors.outside),
        radius / galaxyParams.radius
      );

      colors[i3] = mixedColor.r;
      colors[i3 + 1] = mixedColor.g;
      colors[i3 + 2] = mixedColor.b;

      scales[i] = Math.random() * 0.5 + 0.5; // Random scale between 0.5 and 1.0
    }

    return { positions, colors, scales };
  }, [count, galaxyColors]);

  // Slow rotation animation
  useFrame(({ clock }) => {
    const elapsedTime = clock.getElapsedTime();
    if (pointsRef.current) {
      pointsRef.current.rotation.y = elapsedTime * 0.05; // Slow rotation
      pointsRef.current.rotation.x = Math.sin(elapsedTime * 0.02) * 0.1; // Subtle wave
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[particleData.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[particleData.colors, 3]}
        />
        <bufferAttribute
          attach="attributes-scale"
          args={[particleData.scales, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors
        transparent
        opacity={0.6}
      />
    </points>
  );
};

export default GalaxyParticles;