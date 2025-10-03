# Style Guide: Continuum Design System

This document outlines the visual language and implementation standards for the **Continuum** application, built on **Tailwind CSS 4** and **Radix UI** primitives. Our design goal is a high-contrast, accessible, and modern aesthetic that complements the "galaxy" theme, maintaining optimal readability and ensuring a cohesive, professional user experience across both light and dark modes.

---

## 1. Color Palette & Theming

We use a semantic color naming convention. All color usage must reference the defined **semantic Tailwind classes** (e.g., `bg-default`) to ensure colors are applied based on their purpose rather than a hardcoded hue, facilitating theme switching and maintenance.

### Theme Variables

| Purpose | Light Mode Value (Example) | Dark Mode Value (Example) | Tailwind Class Mapping | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Surface Default** (Base BG) | `#F8FAFC` (Slate 50) | `#030712` (Deep Charcoal) | `bg-default` | Body background, large areas. |
| **Surface Accent** (Card/Panel BG) | `#FFFFFF` (White) | `#0E1729` (Deep Navy) | `bg-accent` | Primary content containers, cards, modals. |
| **Primary Text** (Default copy) | `#1F2937` (Gray 800) | `#E2E8F0` (Slate 200) | `text-primary` | Main headers, body paragraphs. |
| **Secondary Text** (Subtle copy) | `#6B7280` (Gray 500) | `#9CA3AF` (Gray 400) | `text-secondary` | Labels, helper text, timestamps. |
| **Primary Brand** (Highlights) | `#5A48F9` (Vibrant Purple) | `#8B5CF6` (Vibrant Purple) | `bg-brand-primary` / `text-brand-primary` | Primary CTAs, active states, focus rings. |
| **Accent Glow** (Interactive effects) | `#8B5CF6` (Subtle Purple) | `#C4B5FD` (Luminous Lavender) | `shadow-brand-glow` | Subtle shadow/ring effect on interactive elements. |
| **Danger** (Errors, Deletion) | `#EF4444` (Red 500) | `#F87171` (Red 400) | `text-danger` / `bg-danger` | Form validation errors, critical actions. |

> **Rule: High Contrast is Mandatory**
> Ensure all text has a minimum **contrast ratio of 7:1** against its background in both themes to meet WCAG AA standards. This is a non-negotiable accessibility requirement.

---

## 2. Typography & Hierarchy

We prioritize the "**Inter**" font for its highly legible and comprehensive weight set.

| Font Family | **Default**: Inter, fallback to system sans-serif. |

### Semantic Sizes & Hierarchy

The typographic scale must define clear visual hierarchy. Use the semantic sizes below based on the context's importance.

| Role | Semantic Size | Tailwind Utility (Example) | Weight | Line Height/Tracking |
| :--- | :--- | :--- | :--- | :--- |
| **H1** - Page Title | Extra Large | `text-4xl lg:text-5xl` | `font-bold` | `leading-tight` |
| **H2** - Section Header | Large | `text-2xl md:text-3xl` | `font-semibold` | `leading-snug` |
| **H3** - Card Title | Medium | `text-xl` | `font-medium` | `leading-normal` |
| **Body Copy** | Base | `text-base` | `font-normal` | `leading-relaxed` |
| **Small Utility** | Small | `text-sm` | `font-normal` / `font-medium` | `leading-snug` |

> **Rule: Vertical Rhythm**
> Maintain consistent vertical rhythm across the application. The standard line height for body copy (`text-base`) must be at least **1.5** (`leading-relaxed`). Use consistent margin utilities (`my-4`, `mb-2`) to space typography elements predictably.

---

## 3. Spacing & Layout

We adhere strictly to an **8-point grid system**. All spacing (padding, margin, gap) must be a multiple of 8px (e.g., 8, 16, 24, 32 px).

### Spacing Scale

The standard Tailwind scale is used, but developers should prioritize **multiples of 2** (which is 8px) for major layout elements.

* **Tight Spacing** (Element-to-Element): `p-2` (8px) or `m-1` (4px).
* **Standard Padding** (Inside Containers): Use `p-4` (16px) or `p-6` (24px).
* **Separation** (Between Major Elements): Use `my-8` (32px) or `gap-8`.

### Responsiveness

* Design and style for the smallest viewport (no prefix).
* Use responsive prefixes (`sm:`, `md:`, `lg:`) to scale up layout, spacing, and typography for larger screens.
* Avoid fixed pixel widths on containers; use relative units like `w-full`, `max-w-7xl`, or grid/flex layouts to ensure fluid adaptation.

---

## 4. Aesthetic Elements & Iconography

### Border Radius & Shape

To achieve a modern, approachable aesthetic, rounded corners are **mandatory** on all container, card, and interactive elements.

* **Standard Radius**: `rounded-lg` (8px). Used for cards, panels, and major containers.
* **Button/Input Radius**: `rounded-md` (6px). Used for all interactive form elements.
* **Pill/Tag Radius**: `rounded-full`. Used for status tags and badges.

### Elevation (Shadows)

Shadows are used subtly in dark mode to simulate elevation and lift content off the deep background.

* **Standard Elevation**: Applied to Cards/Panels (`bg-accent`). Use `shadow-xl` or a subtle custom shadow that utilizes a hint of the brand color.
* **Interactive Elevation**: Hover states on buttons/links must transition to include `shadow-brand-glow`.

### Iconography

* **Source**: We exclusively use icons from `@radix-ui/react-icons` or **Lucide Icons** (if a Radix icon is unavailable).
* **Sizing**: Icons must be sized relative to the accompanying text. Standard sizes are `w-4 h-4` (for body copy) or `w-6 h-6` (for headers).
* **Color**: Icons typically use `text-secondary` unless they represent an active state or critical action, in which case they use `text-brand-primary` or `text-danger`.

---

## 5. Components & Interaction Patterns

### Cards and Containers

* **Appearance**: All primary content must reside in a **Card** using the `bg-accent` color.
* **Structure**: Cards must use `rounded-lg` and include the **Standard Elevation** shadow. They should contain consistent padding of at least `p-6` to separate content from the border.

### Inputs & Forms

* **Standard Appearance**: Inputs must have a light border, `border-gray-300` (light mode) or `border-gray-700` (dark mode), and use the `rounded-md` radius.
* **Focus State**: The **`ring-2 ring-brand-primary`** utility must be used on the `:focus` state. The focus ring must be highly visible.

### Buttons (Primary & Secondary)

* **Primary Button**: Uses `bg-brand-primary` and `text-white`. Must include a subtle `shadow-md` and a hover state that slightly darkens the background and increases the `shadow-brand-glow`.
* **Secondary Button**: Uses transparent background with `border-2` and `border-brand-primary`, and `text-brand-primary`. Must transition background to a very subtle `bg-brand-primary/10` on hover.

### Motion & Transitions (Framer Motion)

* **Purposeful Motion**: Motion must be fast, subtle, and directly support the user experience (e.g., entrance/exit, eye-guiding focus, state changes).
* **Performance**: All motion should be optimized to run on the GPU (**`transform`**, **`opacity`**).
* **Duration**: Standard interactions should use short durations, such as **`duration-200` to `duration-300ms`**, for snappy feedback.

---

## 6. Global & Accessibility Styling

* **Utility Import**: The file `src/styles/globals.css` is the **only** place where global styles, CSS variable definitions, and Tailwind base imports are permitted.
* **Galaxy Background Detail (Dark Mode)**: The `bg-default` in dark mode should apply a subtle, dark noise texture or radial gradient to hint at the "galaxy" theme and avoid flat black expanses.
* **Focus Ring Enforcement**: The native browser focus ring must be overridden for all interactive elements using the highly visible and on-brand **`ring-2 ring-brand-primary`** utility.
* **No Uncontrolled Scroll**: Content must not cause horizontal scrolling on any viewport. The `overflow-x-hidden` pattern should be used globally if necessary to prevent layout shifts.