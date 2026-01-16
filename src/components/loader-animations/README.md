# Saturn Rings Onboarding Loading

A stunning 3D Saturn-like ring loading animation for the Continuum onboarding flow, featuring rotating gradient rings and floating galaxy particles.

## Components

### `OnboardingLoading.tsx`
Main wrapper component that handles WebGL detection, theme integration, and fade transitions.

**Props:**
- `phrases?: string[]` - Array of phrases to cycle through
- `cycleDuration?: number` - Duration between phrase changes (ms)
- `use3D?: boolean` - Force 3D version or CSS fallback
- `isVisible?: boolean` - Control visibility externally
- `onReady?: () => void` - Callback when ready to fade out
- `showParticles?: boolean` - Show floating galaxy particles
- `size?: "sm" | "md" | "lg" | "full"` - Component size variant
- `overlay?: boolean` - Full-screen overlay mode
- `className?: string` - Optional container class overrides

### `SaturnRingsScene.tsx`
React Three Fiber Canvas setup with WebGPU/WebGL support and lighting.

### `SaturnRingsGroup.tsx`
Groups 3 concentric torus rings with different rotation speeds and opacities.

### `SaturnRing.tsx`
Individual torus ring with login page gradient colors and rotation animation.

### `GalaxyParticles.tsx`
Spiral galaxy particle system with 2500+ particles orbiting in the background.

### `PhraseOverlay.tsx`
Framer Motion text overlay that cycles through multilingual welcome phrases.

### `CSSFallback.tsx`
CSS-only fallback using the login page's gradient and wave animations.

## Features

- **Multi-layered Rings**: 3 concentric torus rings with different rotation speeds
- **Login Gradient Colors**: Uses the same vibrant gradient as the login page
- **Galaxy Particles**: 2500+ particles in spiral formation
- **Theme Support**: Light/dark mode color adaptation
- **Responsive Design**: Scales from mobile to desktop
- **WebGPU/WebGL**: Automatic fallback detection
- **Framer Motion**: Smooth text transitions
- **Performance Optimized**: Instanced rendering and GPU acceleration

## Color Schemes

### Light Theme
- Rings: Login gradient (`#4f46e5` → `#6d5dfc` → `#a855f7` → `#f472b6` → `#22c55e` → `#7dd3fc`)
- Particles: `#5A48F9` (brand primary) → `#1b3984` (dark blue)

### Dark Theme
- Rings: Deep gradients (`#2E2257` → `#462559` → `#8A4374` → `#5A48F9` → `#8B5CF6`)
- Particles: `#8B5CF6` (brand accent) → `#2E2257` (deep purple)

## Usage

```tsx
import OnboardingLoading from "@/components/loader-animations/OnboardingLoading";

// Basic usage
<OnboardingLoading />

// With custom phrases and theme control
<OnboardingLoading
  phrases={["Loading", "Please wait", "Almost ready"]}
  cycleDuration={2000}
  theme="dark"
  showParticles={true}
  onReady={() => console.log("Ready to transition")}
  isVisible={loadingState}
/>
```

## Technical Details

- **Three.js**: Core 3D rendering engine
- **React Three Fiber**: React renderer for Three.js
- **@react-three/drei**: Helpers (GradientTexture, Canvas setup)
- **Framer Motion**: Text animations and fade transitions
- **TypeScript**: Full type safety
- **WebGPU/WebGL**: Automatic capability detection

## Performance

- **Ring Rendering**: Instanced torus geometry with shared materials
- **Particle System**: 2500+ points with additive blending
- **GPU Acceleration**: All animations run on GPU via useFrame
- **Memory Efficient**: Shared geometries and materials
- **Responsive Scaling**: Particle count adjusts for device performance

## Fallback Behavior

When WebGL is not supported:
- Automatically switches to CSS-only animation
- Uses login page gradient and wave effects
- Maintains same phrase cycling and theming
- No visual degradation for users

## Development

```bash
# Install dependencies
bun add three @react-three/fiber @react-three/drei maath
bun add -d @types/three

# Run linting
bun run lint src/components/loader-animations/

# Run tests
bun run tests
```

## File Structure

```
src/components/loader-animations/
├── OnboardingLoading.tsx      # Main wrapper
├── SaturnRingsScene.tsx       # Canvas setup
├── SaturnRing.tsx            # Individual ring
├── SaturnRingsGroup.tsx      # Ring group
├── GalaxyParticles.tsx       # Particle system
├── PhraseOverlay.tsx         # Text overlay
└── CSSFallback.tsx           # CSS fallback
```
