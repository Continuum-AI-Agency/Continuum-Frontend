interface CacheEntry {
    canvas: HTMLCanvasElement;
    w: number;
    h: number;
}
/**
 * Discard the shared font-embed cache so the next prefetch rebuilds
 * it from scratch. Useful when stylesheets are added at runtime.
 */
export declare function invalidateFontEmbedCache(): void;
export declare class HtmlCapture {
    readonly root: HTMLElement;
    readonly cache: Map<HTMLElement, CacheEntry>;
    dpr: number;
    /** Elements with an in-flight html-to-image re-capture (dedupe). */
    private readonly _capturing;
    /**
     * Optional callback fired when an async re-capture finishes and
     * the cache changes. Receives the element whose cache entry was
     * just (re)written so the consumer can scope its dirty marking
     * to glasses that actually intersect that element.
     */
    onCacheUpdate: ((element: HTMLElement) => void) | null;
    /**
     * Prefetched + embedded @font-face blocks. Computed once at init
     * via prefetchFontEmbedCSS. At capture time, filtered per-element
     * to include only the blocks whose family/weight/style/unicode-range
     * match the element's actual text content and computed styles.
     */
    private _fontBlocks;
    constructor(root: HTMLElement);
    /**
     * Resolve the page's @font-face rules into a single CSS string with
     * every `url(...)` source already inlined as a base64 data URL. The
     * result is reused on every subsequent toCanvas call so the captured
     * raster renders text with the page's actual webfonts (e.g. Inter)
     * instead of system fallbacks. Matching glyph metrics is what makes
     * the refracted text line up with the live DOM under the glass.
     *
     * The build is shared at module scope across every LiquidGlass
     * instance — the first init() pays the fetch + base64 cost, every
     * subsequent init() awaits the same Promise.
     *
     * Implemented manually rather than via html-to-image's getFontEmbedCSS
     * because that path walks document.styleSheets via CSSOM, which throws
     * SecurityError on every cross-origin stylesheet and has a brittle
     * recovery flow. We just fetch each <link rel="stylesheet"> directly
     * (CORS-friendly for the typical Google Fonts / CDN cases), regex out
     * the @font-face blocks, and inline each url(...) ourselves.
     */
    prefetchFontEmbedCSS(): Promise<void>;
    /**
     * Return the @font-face CSS string for a specific element,
     * filtered to only the blocks whose family + weight + style
     * match computed styles on the element's text nodes, AND whose
     * unicode-range covers at least one codepoint in the element's
     * text content.
     */
    fontEmbedCSSForElement(element: HTMLElement): string;
    /**
     * Update the device pixel ratio used for future captures.
     */
    resize(dpr?: number): void;
    /**
     * Ensure an element's cached canvas is fresh enough for the current DPR.
     *
     * Cache semantics:
     *   - Fresh hit (size matches within 0.5 px) → return immediately.
     *   - Stale hit (size differs) → keep the stale entry so callers can
     *     stretch-blit it, and kick off an async re-capture.
     *   - Cache miss → kick off an async capture.
     *
     * Concurrent re-captures for the same element are deduplicated
     * via the `_capturing` set, so calling this every frame is cheap.
     */
    captureElement(element: HTMLElement, force?: boolean): Promise<void>;
    /**
     * Draw the current cached capture for an element into an arbitrary
     * 2D canvas. Returns true when a cached snapshot was available.
     */
    drawCachedElement(element: HTMLElement, targetCtx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean;
    /**
     * Capture an element's DOM content as a standalone canvas, optionally
     * excluding specified child nodes from the capture.
     *
     * The hideNodes are pruned from the cloned tree via html-to-image's
     * filter callback, so the live DOM is never mutated and there is no
     * visible flicker on the page even when this runs inside the render
     * loop (e.g. on a re-capture triggered by a content change).
     */
    captureToCanvas(element: HTMLElement, cssW: number, cssH: number, hideNodes?: HTMLElement[] | null): Promise<HTMLCanvasElement | null>;
    /**
     * Remove an element's entry from the capture cache.
     */
    invalidateCache(element: HTMLElement): void;
    /** Destroy the capture system and free resources. */
    destroy(): void;
    private _captureWithHtmlToImage;
}
export {};
//# sourceMappingURL=HtmlCapture.d.ts.map