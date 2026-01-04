"use client";

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import SaturnRingsGroup from "./saturnRingsGroup";
import GalaxyParticles from "./GalaxyParticles";

interface SaturnRingsSceneProps {
  theme: "light" | "dark";
  showParticles?: boolean;
  size?: "sm" | "md" | "lg" | "full";
}

const SaturnRingsScene: React.FC<SaturnRingsSceneProps> = ({
  theme,
  showParticles = true,
  size = "full"
}) => {
  // Camera settings based on size
  const getCameraSettings = () => {
    switch (size) {
      case "sm": return { position: [0, 0, 4] as [number, number, number], fov: 50 };
      case "md": return { position: [0, 0, 5] as [number, number, number], fov: 45 };
      case "lg": return { position: [0, 0, 6] as [number, number, number], fov: 40 };
      default: return { position: [0, 0, 6] as [number, number, number], fov: 45 };
    }
  };

  const cameraSettings = getCameraSettings();

  return (
    <div className="absolute inset-0">
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        }}
        camera={{
          position: cameraSettings.position,
          fov: cameraSettings.fov
        }}
        dpr={[1, 2]}
        resize={{ debounce: 200 }}
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <pointLight position={[5, 5, 5]} intensity={0.8} />
          <pointLight position={[-5, -5, -5]} intensity={0.3} />

          {/* Main rings */}
          <SaturnRingsGroup theme={theme} />

          {/* Background particles */}
          {showParticles && <GalaxyParticles theme={theme} />}

          {/* Optional orbit controls for development */}
          {process.env.NODE_ENV === "development" && (
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              maxPolarAngle={Math.PI / 2}
              minPolarAngle={Math.PI / 2}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
};

export default SaturnRingsScene;
