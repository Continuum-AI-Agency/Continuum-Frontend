"use client";

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { GradientTexture } from "@react-three/drei";
import * as THREE from "three";

interface SaturnRingProps {
  radius: number;
  tube: number;
  rotation: [number, number, number];
  colors: string[];
  speed: number;
  opacity: number;
}

const SaturnRing: React.FC<SaturnRingProps> = ({
  radius,
  tube,
  rotation,
  colors,
  speed,
  opacity
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create gradient texture from colors - convert to separate arrays
  const gradientStops = useMemo(() => {
    return colors.map((_, index) => index / (colors.length - 1));
  }, [colors]);

  // Animation loop
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const elapsedTime = clock.getElapsedTime();
      meshRef.current.rotation.x = rotation[0] + elapsedTime * speed * 0.1;
      meshRef.current.rotation.y = rotation[1] + elapsedTime * speed * 0.15;
      meshRef.current.rotation.z = rotation[2] + elapsedTime * speed * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} rotation={rotation}>
      <torusGeometry args={[radius, tube, 32, 64]} />
      <meshStandardMaterial
        side={THREE.DoubleSide}
        transparent
        opacity={opacity}
        roughness={0.3}
        metalness={0.1}
      >
        <GradientTexture
          stops={gradientStops}
          colors={colors}
          size={512}
        />
      </meshStandardMaterial>
    </mesh>
  );
};

export default SaturnRing;