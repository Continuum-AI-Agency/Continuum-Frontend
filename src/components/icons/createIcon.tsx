import { type ComponentType, createElement, type ReactNode, type SVGProps } from 'react';

export type IconElement = readonly [
  tag: string,
  attrs: Readonly<Record<string, string>>,
  children?: readonly IconElement[],
];

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

export type IconComponent = ComponentType<IconProps>;

function renderElements(elements: readonly IconElement[]): ReactNode[] {
  return elements.map(([tag, attrs, children], index) =>
    createElement(tag, { key: index, ...attrs }, children && renderElements(children)),
  );
}

/** A glyph that labels itself (aria-*, role, title, or children) stays in the a11y tree;
 *  every other glyph is decoration beside its own text, so it is hidden, as lucide did. */
function isLabelled(props: Omit<IconProps, 'size'>): boolean {
  if (props.children) return true;
  return Object.keys(props).some(
    (key) => key.startsWith('aria-') || key === 'role' || key === 'title',
  );
}

/** Hook-free so a glyph renders inside a Server Component without a client boundary. */
export function createIcon(
  slug: string,
  elements: readonly IconElement[],
  viewBox = '0 0 24 24',
): IconComponent {
  function Icon({ size = 24, className, children, ...rest }: IconProps) {
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: a labelled glyph gets its name from the caller's aria-label, role or title; the rest are aria-hidden.
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={isLabelled({ children, ...rest }) ? undefined : true}
        className={className ? `icon icon-${slug} ${className}` : `icon icon-${slug}`}
        {...rest}
      >
        {renderElements(elements)}
        {children}
      </svg>
    );
  }
  Icon.displayName = slug;
  return Icon;
}
