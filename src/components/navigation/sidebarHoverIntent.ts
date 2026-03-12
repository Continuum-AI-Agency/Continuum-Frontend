const DEEP_HOVER_MIN_PX = 44;
const DEEP_HOVER_RATIO = 0.62;

type DeepHoverZoneInput = {
  pointerClientX: number;
  sidebarLeft: number;
  sidebarWidth: number;
};

export function isPointerInDeepSidebarZone({
  pointerClientX,
  sidebarLeft,
  sidebarWidth,
}: DeepHoverZoneInput): boolean {
  if (!Number.isFinite(pointerClientX) || !Number.isFinite(sidebarLeft) || !Number.isFinite(sidebarWidth)) {
    return false;
  }

  if (sidebarWidth <= 0) {
    return false;
  }

  const relativePointerX = pointerClientX - sidebarLeft;
  if (relativePointerX < 0 || relativePointerX > sidebarWidth) {
    return false;
  }

  const threshold = Math.min(sidebarWidth, Math.max(DEEP_HOVER_MIN_PX, sidebarWidth * DEEP_HOVER_RATIO));
  return relativePointerX >= threshold;
}

