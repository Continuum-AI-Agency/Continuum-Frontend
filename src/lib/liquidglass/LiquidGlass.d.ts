import type { GlassConfig } from './defaults.js';
import { HtmlCapture } from './HtmlCapture.js';
import { GlassRenderer } from './GlassRenderer.js';
/** Options accepted by {@link LiquidGlass.init}. */
export interface LiquidGlassOptions {
    /** Root container element. */
    root: HTMLElement;
    /** Elements to apply the glass effect to. */
    glassElements?: NodeListOf<HTMLElement> | HTMLElement[];
    /** Override the default configuration values. */
    defaults?: Partial<GlassConfig>;
}
interface ObjectFitRect {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
}
export declare class LiquidGlass {
    static init(options: LiquidGlassOptions): Promise<LiquidGlass>;
    readonly root: HTMLElement;
    readonly defaults: GlassConfig;
    readonly glassSet: Set<HTMLElement>;
    readonly glassCanvases: Map<HTMLElement, HTMLCanvasElement>;
    readonly capture: HtmlCapture;
    readonly renderer: GlassRenderer;
    /** Current frames-per-second (updated every frame). */
    fps: number;
    private _running;
    private _rafId;
    private _hasDynamic;
    /**
     * Genuinely-global dirty flag — set by events that legitimately
     * affect every glass at once (resize, WebGL context restored,
     * structural mutation of root, end of _start). On the next frame
     * the entry guard promotes it into per-element dirty marks for
     * every glass in glassSet, then clears itself.
     */
    private _globalDirty;
    /**
     * Per-element shader-render dirty set. Each entry is a glass
     * element that needs its WebGL pipeline to re-run on the next
     * frame. Drained at the end of _renderFrame.
     *
     * Mirrors _glassContentDirty (which tracks html-to-image content
     * captures) but for the WebGL shader pass instead of the DOM
     * raster pass — they have different triggers.
     */
    private readonly _glassDirty;
    /**
     * Elements (typically wrappers, glasses themselves, or descendants
     * of root) explicitly marked changed via the public markChanged()
     * API. The next frame fans each one out into _glassDirty by
     * intersecting against every glass's sample rect, then clears
     * the set.
     */
    private readonly _userMarkedChanged;
    private _capturingGlassContent;
    /**
     * Glass elements whose content image is stale and needs to be
     * re-captured. Per-element rather than a single global flag so a
     * mutation inside one glass subtree only re-captures that one
     * element instead of every glass on the page.
     */
    private readonly _glassContentDirty;
    private _fpsFrames;
    private _fpsTime;
    private _observer;
    private _glassSubtreeObserver;
    private _sortedChildren;
    private readonly _glassCache;
    private readonly _glassContentImages;
    private readonly _glassLastSize;
    private readonly _buttonStates;
    private readonly _buttonListeners;
    private readonly _sceneCanvas;
    private readonly _sceneCtx;
    private readonly _drag;
    private readonly _onResize;
    private readonly _onPointerDown;
    private readonly _onPointerMove;
    private readonly _onPointerUp;
    constructor({ root, glassElements, defaults }: LiquidGlassOptions);
    private _start;
    destroy(): void;
    private _setupGlassElements;
    /**
     * Walk up from a mutation target until we hit a glass element
     * registered on this instance. Returns null if the node isn't
     * inside any glass subtree (shouldn't normally happen since the
     * observers are scoped to glass elements, but the mutation target
     * may be a Text node or detached during a removal).
     */
    private _closestGlassAncestor;
    /**
     * Mark a glass element (and any glass that visually depends on it
     * via z-order overlap) as needing a shader re-render on the next
     * frame.
     *
     * `rectOverride` lets callers pass a rect that differs from the
     * element's current bounding box — useful for drag, where we
     * want to invalidate both the *old* and *new* footprints in the
     * same call so glasses behind the dragged panel can clear its
     * trail and glasses ahead can pick up its new shadow.
     */
    private _markGlassAndDependents;
    /**
     * Mark every glass element whose sample rect intersects the given
     * element's bounding rect, regardless of stacking order. Used by
     * the async cache-update callback (a wrapper's pixels just got
     * fresh, so any glass that samples them needs to re-render) and
     * by the public markChanged() API for elements outside the glass
     * set.
     */
    private _markGlassesIntersecting;
    /**
     * Public API: mark an element (or all glass elements when called
     * with no arguments) as needing a shader re-render on the next
     * frame. Useful for content the library can't observe on its own —
     * a `<canvas>` whose pixels you just updated, an `<img>` you just
     * swapped via JS, a wrapper whose CSS background-image you just
     * changed, etc.
     *
     * For elements registered via `data-dynamic`, the library already
     * treats them as always-dirty and re-renders affected glasses
     * every frame; calling markChanged() on them is a no-op but is
     * harmless.
     *
     * @param element The element that changed visually. Pass nothing
     * (or `undefined`) to mark every glass on this instance dirty.
     */
    markChanged(element?: HTMLElement): void;
    private _setupButtonListeners;
    /**
     * Re-capture the DOM content (text, icons, etc.) of glass elements
     * whose subtrees have been mutated since the last capture, hiding
     * the injected shader canvas so it isn't included.
     *
     * Pass `targets = null` to capture every glass element (used at
     * init and on resize); pass a Set to capture only specific ones.
     *
     * Guarded against concurrent execution: if a capture is already
     * running, the affected elements stay in `_glassContentDirty` and
     * the next render-loop tick picks them up.
     */
    private _captureGlassContent;
    /**
     * Synchronously walk every non-glass direct child of root and
     * await its html-to-image capture so the cache is fully populated
     * by the time the render loop starts. Without this, the first
     * frame's glass shader sees an empty (white) local scene for
     * ~one or two frames while the async captures resolve.
     */
    private _prewarmStaticCaptures;
    private _getSortedChildren;
    /**
     * Returns true when the element forms a CSS stacking context — i.e.
     * when its z-index participates in painting order. Mirrors the spec:
     * https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context
     *
     * Used by `_getSortedChildren` to decide painting order for the
     * local scene assembly. The set of triggers needs to match the
     * browser's actual stacking model — otherwise overlays end up
     * painted before the background image and get erased.
     */
    private static _formsStackingContext;
    private _detectDynamic;
    private _getConfig;
    private _handleResize;
    private _updateGlassCanvasSize;
    private _checkGlassSizeChanges;
    /** Parse the current translate(x, y) values from an element's transform. */
    private static _getTranslateXY;
    private _handlePointerDown;
    private _handlePointerMove;
    private _handlePointerUp;
    private _renderLoop;
    private _renderFrame;
    /**
     * Render a single glass element by composing just the scene region
     * that can affect it, then running the shader over that local input.
     *
     * Whether the shader actually re-runs depends on:
     *   - explicit dirty mark for this element (in `dirtyTargets`),
     *   - any earlier glass in z-order that re-rendered this frame
     *     and whose rect intersects this glass's sample rect,
     *   - this glass having moved since last frame (position cache),
     *   - this glass having dynamic contributors in its sample (video,
     *     data-dynamic),
     *   - or active drag involving this element.
     *
     * On render, an entry is pushed to `renderedThisFrame` so later
     * glasses can check whether they need to refresh too.
     */
    private _renderGlassElement;
    /**
     * Build the local input scene for a glass panel by walking only the
     * contributors that paint before it in the stacking order.
     */
    private _composeSceneForGlass;
    private _prepareSceneCanvas;
    private _glassHasDynamicContributors;
    private _childHasDynamicContent;
    private _drawNonGlassChildToScene;
    /**
     * Recursively find and draw all img/video/canvas elements inside
     * a wrapper, skipping any glass elements and their injected canvases.
     */
    private _captureMediaDescendants;
    /** Draw a single img/video/canvas into a local scene canvas. */
    private _drawMediaElement;
    /** Draw an img or video onto a local scene canvas, respecting object-fit. */
    private _drawMediaFitted;
    private _drawPriorGlassToScene;
    private _getPixelRect;
    private _childTouchesSample;
    private _elementTouchesSample;
    private _getPaintOverflowPad;
    private static _rectsIntersect;
    /** Compute the source rectangle for drawImage that replicates CSS object-fit / object-position. */
    static _objectFitRect(natW: number, natH: number, boxW: number, boxH: number, fit: string, pos: string): ObjectFitRect;
}
export {};
//# sourceMappingURL=LiquidGlass.d.ts.map