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
  /** Interior clear glass backdrop blur in px. Default: 14. */
  blur?: number;
  /** Perimeter refractive bevel ring blur in px. Default: 1.5. */
  rimBlur?: number;
  /** Interior backdrop saturation multiplier. Default: 1.95. */
  saturation?: number;
  /** Perimeter refractive ring saturation multiplier. Default: 2.4. */
  rimSaturation?: number;
  /** Override base translucent tint opacity (0..1). Undefined uses tuned theme defaults. */
  tintOpacity?: number;
  /** Controls refractive rim intensity, chromatic meniscus fringe, and optical boost (0..1). Default: 0.85. */
  refraction?: number;
  /** Controls 3D Fresnel specular bevel & moving caustic highlight intensity (0..1). Default: 0.9. */
  specular?: number;
  /** Optical magnification inside the lifted liquid lens droplet. Default: 1.16. */
  lensMagnification?: number;
  /** SwiftUI-equivalent spring response duration in seconds. Default: 0.38. */
  springResponse?: number;
  /** SwiftUI-equivalent spring damping fraction (0..1+). Default: 0.76. */
  springDamping?: number;
  /** Velocity-driven liquid stretch & squish multiplier (0..2). Default: 1.0. */
  squishIntensity?: number;
  /**
   * Enables progressive SDF SVG displacement backdrop refraction on Chromium engines.
   * WebKit / iOS Safari always uses the native GPU multi-layer rim refraction stack.
   * Default: true.
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
  blur: 14,
  rimBlur: 1.5,
  saturation: 1.95,
  rimSaturation: 2.4,
  refraction: 0.85,
  specular: 0.9,
  lensMagnification: 1.16,
  springResponse: 0.38,
  springDamping: 0.76,
  squishIntensity: 1.0,
  enableSvgRefraction: true,
};
