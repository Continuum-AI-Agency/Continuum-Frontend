# Brand Guidelines Generation (AI-Driven)

This document outlines the architecture and implementation for the automated generation of brand colors, taglines, and fonts during the onboarding flow, which eventually persist as the core **Brand Guidelines**.

## Overview
The onboarding Step 1 utilizes **Gemini-3-flash-preview** to derive visual and verbal identity markers from a user's website and uploaded documents. These markers form the foundation of the brand's creative guardrails.

## 1. Data Schema
The generated assets are tracked in the onboarding state and eventually stored in the `brand_profiles.brand_profiles` table.

### Visual Assets Schema
```typescript
{
  tagline: string;          // 5-10 word punchy brand statement
  primaryColor: string;     // Hex code (e.g., #000000)
  secondaryColor: string;   // Hex code (WCAG compliant pairing)
  fonts: {
    heading: string;        // Font family for H1-H6
    body: string;           // Font family for prose
    source: "google-fonts" | "system";
  }
}
```

## 2. Generation Logic
The generation is handled by a dedicated Supabase Edge Function: `brand-draft-visuals`.

### AI Pipeline (Gemini-3-flash-preview)
1. **Extraction:** Gemini crawls the `websiteUrl` to extract existing color palettes and typography.
2. **Analysis:** The model analyzes the `industry` and `brandVoice` to determine if existing styles are modern/effective.
3. **Synthesis:** If the website is sparse or needs improvement, Gemini generates a "Continuum Optimized" identity:
    - **Colors:** Generates a primary color and a high-contrast secondary color.
    - **Typography:** Selects a pairing from Geist, Inter, or top Google Fonts that matches the brand persona (e.g., "Technical" -> "JetBrains Mono").
    - **Tagline:** Distills the brand's unique value proposition from the crawled content.

## 3. Storage & Persistence
- **Onboarding:** Assets live in `user_onboarding_states.state` (JSONB).
- **Finalized Brand:** Upon approval, fields are moved to:
    - `brand_profiles.brand_profiles.tagline`
    - `brand_profiles.brand_profiles.primary_color`
    - `brand_profiles.brand_profiles.secondary_color`
    - `brand_profiles.brand_profiles.fonts` (JSONB)

## 4. UI Integration
- **Real-time Preview:** Swatches and font previews are rendered in `BrandProfileStep.tsx` as soon as the SSE stream delivers the deltas.
- **Approval Flow:** Users can manually override the AI's suggestions before proceeding to Step 2.
