export interface GlassConfig {
    /** Background blur strength (0 = sharp, 1 = maximum blur). */
    blurAmount: number;
    /** Refraction strength — how much the glass bends the image behind it */
    refraction: number;
    /** Chromatic aberration — color fringing at edges */
    chromAberration: number;
    /** Edge highlight intensity (inner glow / rim lighting) */
    edgeHighlight: number;
    /** Specular highlight intensity (Blinn-Phong) */
    specular: number;
    /** Fresnel reflection intensity at grazing angles */
    fresnel: number;
    /** Micro-distortion noise strength */
    distortion: number;
    /** Corner radius in CSS pixels */
    cornerRadius: number;
    /** Z-radius (bevel depth) — controls the curvature of the pill bevel */
    zRadius: number;
    /** Overall opacity of the glass panel */
    opacity: number;
    /** Saturation adjustment (-1 = desaturated, 0 = normal, 1 = vivid) */
    saturation: number;
    /** Tint strength — cool blue-ish glass tint */
    tintStrength: number;
    /** Brightness adjustment (-0.5 to 0.5) */
    brightness: number;
    /** Shadow opacity (0 = no shadow, 1 = full black) */
    shadowOpacity: number;
    /** Shadow spread in CSS pixels */
    shadowSpread: number;
    /** Shadow vertical offset in CSS pixels */
    shadowOffsetY: number;
    /** Whether this glass element can be dragged around (Pointer Events) */
    floating: boolean;
    /** Whether this glass element behaves as a button (hover lift + press effect) */
    button: boolean;
    /**
     * Bevel mode: 0 = biconvex pill (half-circle cross-section, default),
     * 1 = dome (flat bottom, quarter-circle top — use with cornerRadius = zRadius
     * for a perfect half-sphere magnifier effect).
     */
    bevelMode: number;
}
export declare const DEFAULTS: GlassConfig;
/** Number of Gaussian blur passes (higher = smoother but slower) */
export declare const BLUR_ITERATIONS = 6;
/** Extra padding around each panel for rendering the drop shadow (px) */
export declare const SHADOW_PAD = 20;
//# sourceMappingURL=defaults.d.ts.map