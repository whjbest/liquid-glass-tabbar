import type { CSSProperties, ReactNode } from "react";

export type LiquidGlassAppearance = "light" | "dark" | "auto";

export type LiquidGlassSize = "sm" | "default" | "lg";

export type LiquidGlassHapticKind = "selection" | "press" | "release";

export type LiquidGlassTabItem = {
  /** Unique identifier for this tab (typically a route path or key). */
  value: string;
  /** Visible text label below the icon. */
  label: string;
  /** Default icon rendered for this tab. */
  icon?: ReactNode;
  /** Optional alternate icon rendered when the tab is active or under the lens. */
  activeIcon?: ReactNode;
  /** Disables interaction and skips keyboard roving focus. */
  disabled?: boolean;
  /** Optional compact badge (e.g. unread count or dot ""). */
  badge?: string | number;
};

export type LiquidGlassSearchConfig = {
  /** Accessible label for the trailing round search button (UISearchTab). */
  label?: string;
  /** Custom icon; defaults to a crisp SF-style magnifying glass SVG. */
  icon?: ReactNode;
  /** Marks the search button as the currently active destination. */
  active?: boolean;
  /** Invoked when the user taps the search button. */
  onActivate?: () => void;
};

export type LiquidGlassConfig = {
  /** Interior clear glass backdrop blur in px. Default: 3.5 (crystal clear). */
  blur?: number;
  /** WebKit perimeter bevel ring blur in px. Default: 0.75. */
  rimBlur?: number;
  /** Interior backdrop saturation multiplier. Default: 2.05. */
  saturation?: number;
  /** WebKit perimeter ring saturation multiplier. Default: 2.5. */
  rimSaturation?: number;
  /** Override base translucent tint opacity (0..1). Undefined uses clear theme defaults (~0.16–0.20). */
  tintOpacity?: number;
  /** Controls Snell's Law refraction strength, bevel bend, and lens distortion (0..1). Default: 0.9. */
  refraction?: number;
  /** Controls RGB chromatic dispersion prism splitting at glass edges (0..1). Default: 0.75. */
  chromaticAberration?: number;
  /** Controls 3D Fresnel specular bevel & moving caustic highlight intensity (0..1). Default: 0.95. */
  specular?: number;
  /** Optical magnification inside the lifted liquid lens droplet. Default: 1.18. */
  lensMagnification?: number;
  /** SwiftUI-equivalent spring response duration in seconds. Default: 0.36. */
  springResponse?: number;
  /** SwiftUI-equivalent spring damping fraction (0..1+). Default: 0.74. */
  springDamping?: number;
  /** Velocity-driven liquid stretch & squish multiplier (0..2). Default: 1.1. */
  squishIntensity?: number;
  /**
   * Enables real Snell's Law SDF SVG displacement + RGB dispersion backdrop
   * refraction on Chromium engines. AppleWebKit uses the native GPU rim +
   * dual-zone optical portal lens stack. Default: true.
   */
  enableSvgRefraction?: boolean;
};

export type LiquidGlassTabBarProps = {
  /** Primary tab items rendered inside the floating liquid glass capsule. */
  items: readonly LiquidGlassTabItem[];
  /** Currently active tab value. */
  value: string;
  /** Called when the user selects a different tab via tap, drag-release, or keyboard. */
  onValueChange: (value: string) => void;
  /** Called on every activation, including re-tapping the already active tab. */
  onItemActivate?: (value: string) => void;
  /** Optional callback to bridge Telegram / Capacitor / Web haptic feedback. */
  onHaptic?: (kind: LiquidGlassHapticKind) => void;
  /** Color appearance for the glass material. Default: "auto". */
  appearance?: LiquidGlassAppearance;
  /** Optional separate trailing round search button (matches iOS 26 UISearchTab). */
  search?: LiquidGlassSearchConfig;
  /** Fine-grained optical and spring physics parameters. */
  glass?: LiquidGlassConfig;
  /** Size preset. Default: "default". */
  size?: LiquidGlassSize;
  /** Optional visual mode: "liquid" (iOS 26 Liquid Glass) or "frosted" (flat frosted baseline). Default: "liquid". */
  variant?: "liquid" | "frosted";
  /** Accessible navigation label. */
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
};

export const LIQUID_GLASS_DEFAULTS: Required<
  Omit<LiquidGlassConfig, "tintOpacity">
> = {
  blur: 3.5,
  rimBlur: 0.75,
  saturation: 2.05,
  rimSaturation: 2.5,
  refraction: 0.9,
  chromaticAberration: 0.75,
  specular: 0.95,
  lensMagnification: 1.18,
  springResponse: 0.38,
  springDamping: 0.68,
  squishIntensity: 1.15,
  enableSvgRefraction: true,
};
