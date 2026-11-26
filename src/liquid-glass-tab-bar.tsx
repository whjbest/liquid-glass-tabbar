"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createCapsuleRefractionFilter,
  type SdfRefractionHandle,
  supportsSvgBackdropRefraction,
} from "./optics";
import {
  computeLiquidDeformation,
  isSpringSettled,
  rubberBand,
  type SpringState,
  stepSpring,
} from "./spring";
import {
  LIQUID_GLASS_DEFAULTS,
  type LiquidGlassAppearance,
  type LiquidGlassTabBarProps,
  type LiquidGlassTabItem,
} from "./types";

type ItemRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type TrackLayout = {
  width: number;
  height: number;
  items: ItemRect[];
};

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  active: boolean;
  value: string;
  timer: ReturnType<typeof setTimeout> | null;
};

const LENS_EXTRA_WIDTH = 16;
const LENS_EXTRA_HEIGHT = 20;

function DefaultSearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.75" />
      <path d="m16.25 16.25 4.25 4.25" />
    </svg>
  );
}

function useResolvedAppearance(
  appearance: LiquidGlassAppearance,
): "light" | "dark" {
  const read = useCallback((): "light" | "dark" => {
    if (appearance === "light" || appearance === "dark") return appearance;
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (root.classList.contains("dark")) return "dark";
      const explicit = root.getAttribute("data-appearance");
      if (explicit === "dark" || explicit === "light") return explicit;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }, [appearance]);

  const [resolved, setResolved] = useState<"light" | "dark">(read);

  useEffect(() => {
    setResolved(read());
    if (appearance !== "auto" || typeof window === "undefined") return;

    const sync = () => setResolved(read());
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-appearance"],
    });
    return () => {
      media?.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, [appearance, read]);

  return resolved;
}

function renderTabVisual(item: LiquidGlassTabItem, useActiveIcon: boolean) {
  const icon = useActiveIcon && item.activeIcon ? item.activeIcon : item.icon;
  const hasBadge = item.badge !== undefined && item.badge !== null;
  const isDot = item.badge === "";
  return (
    <span data-tab-bar-content="" className="lgtb-item-content">
      {icon ? (
        <span aria-hidden="true" className="lgtb-item-icon">
          {icon}
          {hasBadge ? (
            <span
              className="lgtb-badge"
              data-dot={isDot ? "true" : undefined}
              aria-hidden="true"
            >
              {isDot ? null : item.badge}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="lgtb-item-label">{item.label}</span>
    </span>
  );
}

/**
 * High-fidelity iOS 26 Liquid Glass TabBar for React.
 *
 * Uses single-pass Snell's Law backdrop refraction on Chromium (refracting
 * the TabBar's own top/bottom border edges, page background, and icons with
 * zero ghosting) and GPU-composited clear glass + bevels on iOS WebKit.
 */
export function LiquidGlassTabBar({
  items,
  value,
  onValueChange,
  onItemActivate,
  onHaptic,
  appearance = "auto",
  search,
  glass,
  size = "default",
  variant = "liquid",
  "aria-label": ariaLabel = "Main navigation",
  className,
  style,
}: LiquidGlassTabBarProps) {
  const resolvedAppearance = useResolvedAppearance(appearance);
  const cfg = useMemo(
    () => ({
      ...LIQUID_GLASS_DEFAULTS,
      ...glass,
    }),
    [glass],
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const trackCoreRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchCoreRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const lensFillRef = useRef<HTMLDivElement>(null);

  const layoutRef = useRef<TrackLayout | null>(null);
  const [hasLayout, setHasLayout] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [dragHoverValue, setDragHoverValue] = useState<string | null>(null);
  const [searchPressed, setSearchPressed] = useState(false);
  const [focusedValue, setFocusedValue] = useState<string | null>(null);
  const [svgLensActive, setSvgLensActive] = useState(false);

  const reducedMotionRef = useRef(false);
  const dragRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);

  // Spring states mutated exclusively inside the rAF loop (zero React re-renders at 120fps)
  const springXRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const springWRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const springLiftRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const springPressRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const targetXRef = useRef(0);
  const targetWRef = useRef(0);
  const targetLiftRef = useRef(0);
  const targetPressRef = useRef(0);
  const overshootRef = useRef(0);
  const initializedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const variantRef = useRef(variant);
  variantRef.current = variant;

  const activeIndex = items.findIndex(
    (item) => item.value === value && !item.disabled,
  );
  const firstEnabledIndex = items.findIndex((item) => !item.disabled);
  const focusIndex = items.findIndex(
    (item) => item.value === focusedValue && !item.disabled,
  );
  let rovingTabIndex = firstEnabledIndex;
  if (activeIndex >= 0) rovingTabIndex = activeIndex;
  if (focusIndex >= 0) rovingTabIndex = focusIndex;

  const displayedActiveValue = dragHoverValue ?? value;
  const showLens = hasLayout && (activeIndex >= 0 || dragHoverValue !== null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = () => {
      reducedMotionRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /** Writes the current spring physics state directly to GPU-composited DOM nodes. */
  const paintLens = useCallback(() => {
    const trackEl = trackRef.current;
    const lensEl = lensRef.current;
    const layout = layoutRef.current;
    if (!lensEl || !layout) return;

    const firstItem = layout.items[0];
    if (!firstItem) return;

    const c = cfgRef.current;
    const isLiquid = variantRef.current === "liquid";
    const reduced = reducedMotionRef.current;

    // Gentle iOS-native track breath scale on press with elastic rebound on release
    if (trackEl) {
      const press = isLiquid && !reduced ? springPressRef.current.value : 0;
      trackEl.style.setProperty("--lgtb-press", press.toFixed(4));
    }

    const cx = springXRef.current.value;
    const vx = springXRef.current.velocity;
    const baseW = Math.max(springWRef.current.value, 24);
    const baseH = firstItem.height;
    const cy = firstItem.centerY;

    const flightLift =
      isLiquid && !reduced
        ? Math.min(0.92, Math.tanh(Math.abs(vx) / 700) * 0.98)
        : 0;
    const lift =
      isLiquid && !reduced
        ? Math.min(
            1.12,
            Math.max(0, Math.max(springLiftRef.current.value, flightLift)),
          )
        : 0;

    // Overhangs top & bottom edges of the track so the convex lens pulls in
    // and refracts the TabBar's own borders + outside page color like iOS 26.
    const w = baseW + lift * LENS_EXTRA_WIDTH;
    const h = baseH + lift * LENS_EXTRA_HEIGHT;
    const x = cx - w / 2;
    const y = cy - h / 2;

    const { scaleX, scaleY, lightOffset } =
      isLiquid && !reduced
        ? computeLiquidDeformation(vx, overshootRef.current, c.squishIntensity)
        : { scaleX: 1, scaleY: 1, lightOffset: 0 };

    const clampedOpacityLift = Math.min(1, Math.max(0, lift));

    lensEl.style.width = `${w.toFixed(2)}px`;
    lensEl.style.height = `${h.toFixed(2)}px`;
    lensEl.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale3d(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}, 1)`;
    lensEl.style.setProperty("--lgtb-lift", clampedOpacityLift.toFixed(4));
    lensEl.style.setProperty("--lgtb-light-x", lightOffset.toFixed(4));
    lensEl.dataset.elevated = clampedOpacityLift > 0.02 ? "true" : "false";
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current) return;
    lastFrameTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      const c = cfgRef.current;
      const dragging = Boolean(dragRef.current?.active);

      if (reducedMotionRef.current) {
        springXRef.current = { value: targetXRef.current, velocity: 0 };
        springWRef.current = { value: targetWRef.current, velocity: 0 };
        springLiftRef.current = { value: targetLiftRef.current, velocity: 0 };
        springPressRef.current = { value: targetPressRef.current, velocity: 0 };
        paintLens();
        rafRef.current = 0;
        return;
      }

      const xParams = dragging
        ? { response: 0.11, dampingFraction: 0.88 }
        : { response: c.springResponse, dampingFraction: c.springDamping };
      const wParams = { response: 0.28, dampingFraction: 0.84 };
      // Underdamped release spring gives the iconic iOS 26 elastic snap-back
      const liftParams =
        targetLiftRef.current > springLiftRef.current.value
          ? { response: 0.22, dampingFraction: 0.72 }
          : { response: 0.36, dampingFraction: 0.66 };
      const pressParams =
        targetPressRef.current > springPressRef.current.value
          ? { response: 0.24, dampingFraction: 0.76 }
          : { response: 0.36, dampingFraction: 0.62 };

      springXRef.current = stepSpring(
        springXRef.current,
        targetXRef.current,
        dt,
        xParams,
      );
      springWRef.current = stepSpring(
        springWRef.current,
        targetWRef.current,
        dt,
        wParams,
      );
      springLiftRef.current = stepSpring(
        springLiftRef.current,
        targetLiftRef.current,
        dt,
        liftParams,
      );
      springPressRef.current = stepSpring(
        springPressRef.current,
        targetPressRef.current,
        dt,
        pressParams,
      );

      paintLens();

      const settled =
        !dragging &&
        isSpringSettled(springXRef.current, targetXRef.current, 0.08, 0.4) &&
        isSpringSettled(springWRef.current, targetWRef.current, 0.08, 0.4) &&
        isSpringSettled(
          springLiftRef.current,
          targetLiftRef.current,
          0.004,
          0.02,
        ) &&
        isSpringSettled(
          springPressRef.current,
          targetPressRef.current,
          0.004,
          0.02,
        );

      if (settled) {
        springXRef.current = { value: targetXRef.current, velocity: 0 };
        springWRef.current = { value: targetWRef.current, velocity: 0 };
        springLiftRef.current = { value: targetLiftRef.current, velocity: 0 };
        springPressRef.current = { value: targetPressRef.current, velocity: 0 };
        overshootRef.current = 0;
        paintLens();
        rafRef.current = 0;
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [paintLens]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const itemsSignature = items
    .map((item) => `${item.value}:${Boolean(item.disabled)}`)
    .join("\0");

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const buttons = Array.from(
      track.querySelectorAll<HTMLButtonElement>("button[data-tab-bar-item]"),
    );
    if (!buttons.length) return;

    const rects: ItemRect[] = buttons.map((button) => ({
      x: button.offsetLeft,
      y: button.offsetTop,
      width: button.offsetWidth,
      height: button.offsetHeight,
      centerX: button.offsetLeft + button.offsetWidth / 2,
      centerY: button.offsetTop + button.offsetHeight / 2,
    }));

    layoutRef.current = {
      width: track.offsetWidth,
      height: track.offsetHeight,
      items: rects,
    };
    setHasLayout(true);

    if (!dragRef.current?.active && activeIndex >= 0) {
      const targetRect = rects[activeIndex];
      if (targetRect) {
        targetXRef.current = targetRect.centerX;
        targetWRef.current = targetRect.width;
        if (!initializedRef.current) {
          springXRef.current = { value: targetRect.centerX, velocity: 0 };
          springWRef.current = { value: targetRect.width, velocity: 0 };
          springLiftRef.current = { value: 0, velocity: 0 };
          initializedRef.current = true;
          paintLens();
        } else {
          startLoop();
        }
      }
    }
  }, [activeIndex, paintLens, startLoop]);

  useLayoutEffect(() => {
    void itemsSignature;
    void size;
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    for (const button of track.querySelectorAll("button")) {
      observer.observe(button);
    }
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [itemsSignature, size, measure]);

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!layout || dragRef.current?.active) return;
    if (activeIndex < 0) {
      targetLiftRef.current = 0;
      overshootRef.current = 0;
      return;
    }
    const targetRect = layout.items[activeIndex];
    if (!targetRect) return;
    targetXRef.current = targetRect.centerX;
    targetWRef.current = targetRect.width;
    targetLiftRef.current = 0;
    overshootRef.current = 0;

    if (!initializedRef.current || reducedMotionRef.current) {
      springXRef.current = { value: targetRect.centerX, velocity: 0 };
      springWRef.current = { value: targetRect.width, velocity: 0 };
      springLiftRef.current = { value: 0, velocity: 0 };
      initializedRef.current = true;
      paintLens();
    } else {
      startLoop();
    }
  }, [activeIndex, paintLens, startLoop]);

  // Progressive Chromium Snell's Law SDF + pastel RGB dispersion filters
  // Attached to Track, Search circle, AND lifted Lens droplet (no-op on WebKit).
  useEffect(() => {
    void itemsSignature;
    void size;
    if (
      variant !== "liquid" ||
      !cfg.enableSvgRefraction ||
      typeof document === "undefined" ||
      !supportsSvgBackdropRefraction()
    ) {
      setSvgLensActive(false);
      return;
    }

    const track = trackRef.current;
    const trackCore = trackCoreRef.current;
    const searchEl = searchRef.current;
    const searchCore = searchCoreRef.current;
    const lensFill = lensFillRef.current;

    const handles: SdfRefractionHandle[] = [];

    const attach = (
      width: number,
      height: number,
      core: HTMLElement | null,
      cssVarName: string,
      profile: "track" | "lens",
      blurOverride?: number,
    ) => {
      if (!core || width <= 4 || height <= 4) return false;
      const handle = createCapsuleRefractionFilter(document, {
        width,
        height,
        blur: blurOverride ?? cfg.blur,
        refraction: cfg.refraction,
        chromaticAberration: cfg.chromaticAberration,
        profile,
      });
      if (handle) {
        core.style.setProperty(cssVarName, handle.filterUrl);
        core.dataset.svgRefract = "true";
        handles.push(handle);
        return true;
      }
      delete core.dataset.svgRefract;
      core.style.removeProperty(cssVarName);
      return false;
    };

    const rebuild = () => {
      for (const h of handles.splice(0)) h.destroy();
      let lensOk = false;
      if (track) {
        const rect = track.getBoundingClientRect();
        attach(
          rect.width,
          rect.height,
          trackCore,
          "--lgtb-svg-filter",
          "track",
        );
        const firstButton = track.querySelector<HTMLButtonElement>(
          "button[data-tab-bar-item]",
        );
        if (firstButton) {
          lensOk = attach(
            firstButton.offsetWidth + LENS_EXTRA_WIDTH,
            firstButton.offsetHeight + LENS_EXTRA_HEIGHT,
            lensFill,
            "--lgtb-lens-svg-filter",
            "lens",
            0,
          );
        }
      }
      if (searchEl) {
        const rect = searchEl.getBoundingClientRect();
        attach(
          rect.width,
          rect.height,
          searchCore,
          "--lgtb-svg-filter",
          "track",
        );
      }
      setSvgLensActive(lensOk);
    };

    rebuild();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        for (const h of handles) h.destroy();
      };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 100);
    });
    if (track) observer.observe(track);
    if (searchEl) observer.observe(searchEl);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      for (const h of handles) h.destroy();
      setSvgLensActive(false);
      for (const [el, prop] of [
        [trackCore, "--lgtb-svg-filter"],
        [searchCore, "--lgtb-svg-filter"],
        [lensFill, "--lgtb-lens-svg-filter"],
      ] as const) {
        if (el) {
          delete el.dataset.svgRefract;
          el.style.removeProperty(prop);
        }
      }
    };
  }, [
    variant,
    cfg.enableSvgRefraction,
    cfg.blur,
    cfg.refraction,
    cfg.chromaticAberration,
    itemsSignature,
    size,
  ]);

  const resolvePointerTrack = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      const layout = layoutRef.current;
      if (!track || !layout?.items.length) return null;

      const rect = track.getBoundingClientRect();
      const localX =
        ((clientX - rect.left) / Math.max(rect.width, 1)) * layout.width;

      const first = layout.items[0];
      const last = layout.items[layout.items.length - 1];
      if (!first || !last) return null;

      const banded = rubberBand(
        localX,
        first.centerX,
        last.centerX,
        first.width,
        0.55,
      );

      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < layout.items.length; i++) {
        const candidate = items[i];
        const box = layout.items[i];
        if (!candidate || candidate.disabled || !box) continue;
        const dist = Math.abs(box.centerX - localX);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestIndex = i;
        }
      }

      return {
        cx: banded.value,
        overshoot: banded.overshoot,
        nearestIndex,
        nearestItem: nearestIndex >= 0 ? items[nearestIndex] : undefined,
        nearestRect: nearestIndex >= 0 ? layout.items[nearestIndex] : undefined,
      };
    },
    [items],
  );

  const cancelDrag = useCallback(() => {
    const session = dragRef.current;
    if (session?.timer) clearTimeout(session.timer);
    if (session && trackRef.current?.hasPointerCapture?.(session.pointerId)) {
      trackRef.current.releasePointerCapture(session.pointerId);
    }
    dragRef.current = null;
    overshootRef.current = 0;
    targetLiftRef.current = 0;
    targetPressRef.current = 0;
    setElevated(false);
    setDragHoverValue(null);

    const layout = layoutRef.current;
    if (layout && activeIndex >= 0 && layout.items[activeIndex]) {
      const box = layout.items[activeIndex];
      targetXRef.current = box.centerX;
      targetWRef.current = box.width;
    }
    startLoop();
  }, [activeIndex, startLoop]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("blur", cancelDrag);
      if (dragRef.current?.timer) clearTimeout(dragRef.current.timer);
    };
  }, [cancelDrag]);

  const activateDrag = useCallback(() => {
    const session = dragRef.current;
    const track = trackRef.current;
    if (!session || session.active || !track) return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    session.active = true;

    try {
      track.setPointerCapture?.(session.pointerId);
    } catch {
      // Synthetic pointer events in tests may not support capture.
    }

    const resolved = resolvePointerTrack(session.currentX);
    if (resolved) {
      targetXRef.current = resolved.cx;
      overshootRef.current = resolved.overshoot;
      if (resolved.nearestRect) targetWRef.current = resolved.nearestRect.width;
      if (resolved.nearestItem) {
        session.value = resolved.nearestItem.value;
        setDragHoverValue(resolved.nearestItem.value);
      }
    }

    targetLiftRef.current = 1;
    targetPressRef.current = 1;
    setElevated(true);
    onHaptic?.("press");
    startLoop();
  }, [onHaptic, resolvePointerTrack, startLoop]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || dragRef.current) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-tab-bar-item]",
    );
    if (!button || button.disabled) return;
    const index = Number(button.dataset.tabBarItem);
    const item = items[index];
    if (!item || item.disabled) return;

    // Prevent mouse/touch presses from triggering a sticky white focus ring;
    // keyboard Tab / Arrow navigation still receives full :focus-visible rings.
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    suppressClickRef.current = false;
    const session: DragSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      active: false,
      value: item.value,
      timer: null,
    };
    dragRef.current = session;

    // Immediately breathe the track outward and begin clearing the lens on touch-down
    targetPressRef.current = 1;
    if (item.value === value) {
      targetLiftRef.current = 0.72;
    }
    startLoop();

    session.timer = setTimeout(() => {
      if (dragRef.current === session) activateDrag();
    }, 95);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.currentX = event.clientX;

    const dx = Math.abs(event.clientX - session.startX);
    const dy = Math.abs(event.clientY - session.startY);

    if (!session.active) {
      if (dx >= 5 && dx >= dy) {
        activateDrag();
      } else if (dy > 14 && dy > dx) {
        cancelDrag();
        return;
      } else {
        return;
      }
    }

    const resolved = resolvePointerTrack(event.clientX);
    if (!resolved) return;

    targetXRef.current = resolved.cx;
    overshootRef.current = resolved.overshoot;
    if (resolved.nearestRect) targetWRef.current = resolved.nearestRect.width;

    if (resolved.nearestItem && resolved.nearestItem.value !== session.value) {
      session.value = resolved.nearestItem.value;
      setDragHoverValue(resolved.nearestItem.value);
      onHaptic?.("selection");
    }

    startLoop();
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (session.active) {
      suppressClickRef.current = true;
      const resolved = resolvePointerTrack(event.clientX);
      const committed = resolved?.nearestItem;
      const committedRect = resolved?.nearestRect;

      if (session.timer) clearTimeout(session.timer);
      if (trackRef.current?.hasPointerCapture?.(session.pointerId)) {
        trackRef.current.releasePointerCapture(session.pointerId);
      }
      dragRef.current = null;
      overshootRef.current = 0;
      targetLiftRef.current = 0;
      targetPressRef.current = 0;
      setElevated(false);
      setDragHoverValue(null);

      if (committed && !committed.disabled) {
        if (committedRect) {
          targetXRef.current = committedRect.centerX;
          targetWRef.current = committedRect.width;
        }
        onItemActivate?.(committed.value);
        if (committed.value !== value) {
          onValueChange(committed.value);
        }
        onHaptic?.("release");
      }
      startLoop();
      return;
    }

    if (session.timer) clearTimeout(session.timer);
    dragRef.current = null;
    targetPressRef.current = 0;
    targetLiftRef.current = 0;
    startLoop();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-tab-bar-item]",
    );
    if (!button || !trackRef.current?.contains(button)) return;

    const current = Number(button.dataset.tabBarItem);
    const enabled = items
      .map((item, idx) => (item.disabled ? -1 : idx))
      .filter((idx) => idx >= 0);
    if (!enabled.length) return;

    const rtl = getComputedStyle(trackRef.current).direction === "rtl";
    const prevKey = rtl ? "ArrowRight" : "ArrowLeft";
    const nextKey = rtl ? "ArrowLeft" : "ArrowRight";

    let next: number | undefined;
    if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    else if (event.key === prevKey || event.key === nextKey) {
      const dir = event.key === nextKey ? 1 : -1;
      const pos = enabled.indexOf(current);
      next = enabled[(pos + dir + enabled.length) % enabled.length];
    }

    if (next === undefined) return;
    event.preventDefault();
    const destination = trackRef.current.querySelector<HTMLButtonElement>(
      `button[data-tab-bar-item="${next}"]`,
    );
    destination?.focus();
  };

  if (!items.length) return null;

  const cssVars: CSSProperties = {
    ...(style ?? {}),
    ["--lgtb-blur" as string]: `${cfg.blur}px`,
    ["--lgtb-rim-blur" as string]: `${cfg.rimBlur}px`,
    ["--lgtb-sat" as string]: String(cfg.saturation),
    ["--lgtb-rim-sat" as string]: String(cfg.rimSaturation),
    ["--lgtb-refraction" as string]: String(cfg.refraction),
    ["--lgtb-chroma" as string]: String(cfg.chromaticAberration),
    ["--lgtb-specular" as string]: String(cfg.specular),
    ["--lgtb-lens-mag" as string]: String(cfg.lensMagnification),
    ...(cfg.tintOpacity !== undefined
      ? { ["--lgtb-surface-alpha" as string]: String(cfg.tintOpacity) }
      : {}),
  };

  return (
    <nav
      aria-label={ariaLabel}
      data-slot="tab-bar"
      data-appearance={resolvedAppearance}
      data-size={size}
      data-variant={variant}
      data-search-active={search?.active ? "true" : "false"}
      className={className ? `lgtb-root ${className}` : "lgtb-root"}
      style={cssVars}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Delegates pointer scrubbing and roving keyboard navigation for child tab buttons. */}
      <div
        ref={trackRef}
        data-slot="tab-bar-list"
        data-elevated={elevated ? "true" : "false"}
        data-svg-lens={svgLensActive ? "true" : "false"}
        className="lgtb-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelDrag}
        onDragStart={(event) => event.preventDefault()}
        onContextMenu={(event) => {
          if (dragRef.current?.active) event.preventDefault();
        }}
        onClickCapture={(event) => {
          if (suppressClickRef.current && event.detail > 0) {
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Multi-layer GPU Liquid Glass Track Shell */}
        <div aria-hidden="true" className="lgtb-glass-shell">
          <div ref={trackCoreRef} className="lgtb-glass-core" />
          <div className="lgtb-rim-mask">
            <div className="lgtb-rim-backdrop" />
          </div>
          <div className="lgtb-glass-sheen" />
        </div>
        {/* Track specular border stays at z-index: 1 so the lifted droplet refracts it */}
        <div aria-hidden="true" className="lgtb-specular" />

        {/* Interactive Tab Buttons */}
        {items.map((item, index) => {
          const isCurrent = item.value === value && !item.disabled;
          const isActiveVisual =
            item.value === displayedActiveValue && !item.disabled;
          const isHeld = elevated && dragHoverValue === item.value;
          return (
            <button
              key={item.value}
              type="button"
              disabled={item.disabled}
              data-tab-bar-item={index}
              data-active={isActiveVisual ? "true" : "false"}
              data-held={isHeld ? "true" : "false"}
              aria-current={isCurrent ? "page" : undefined}
              tabIndex={index === rovingTabIndex ? 0 : -1}
              className="lgtb-item"
              onFocus={() => setFocusedValue(item.value)}
              onClick={() => {
                if (item.disabled) return;
                onItemActivate?.(item.value);
                if (item.value !== value) {
                  onValueChange(item.value);
                  onHaptic?.("selection");
                }
              }}
            >
              {renderTabVisual(item, isActiveVisual)}
            </button>
          );
        })}

        {/* Interactive Liquid Glass Lens Droplet (Single-Pass, Zero Ghosting) */}
        <div
          ref={lensRef}
          aria-hidden="true"
          data-slot="tab-bar-indicator"
          data-elevated="false"
          className="lgtb-lens"
          style={{
            opacity: showLens ? 1 : 0,
            transition: "opacity 160ms ease",
          }}
        >
          <div className="lgtb-lens-shadow" />
          <div className="lgtb-lens-clip">
            <div className="lgtb-lens-rest-fill" />
            <div ref={lensFillRef} className="lgtb-lens-liquid-fill" />
            <div className="lgtb-lens-meniscus" />
            <div className="lgtb-lens-rim" />
          </div>
        </div>
      </div>

      {/* Separate Trailing Round Search Button (iOS 26 UISearchTab) */}
      {search ? (
        <div
          ref={searchRef}
          data-slot="tab-bar-search"
          data-active={search.active ? "true" : "false"}
          data-pressed={searchPressed ? "true" : "false"}
          className="lgtb-search"
        >
          <div aria-hidden="true" className="lgtb-glass-shell">
            <div ref={searchCoreRef} className="lgtb-glass-core" />
            <div className="lgtb-rim-mask">
              <div className="lgtb-rim-backdrop" />
            </div>
            <div className="lgtb-glass-sheen" />
          </div>
          <div aria-hidden="true" className="lgtb-specular" />

          <button
            type="button"
            aria-label={search.label ?? "Search"}
            aria-pressed={search.active ? "true" : undefined}
            className="lgtb-search-btn"
            onPointerDown={(event) => {
              event.preventDefault();
              setSearchPressed(true);
              onHaptic?.("press");
            }}
            onPointerUp={() => setSearchPressed(false)}
            onPointerCancel={() => setSearchPressed(false)}
            onPointerLeave={() => setSearchPressed(false)}
            onClick={() => {
              onHaptic?.("selection");
              search.onActivate?.();
            }}
          >
            {search.icon ?? <DefaultSearchIcon />}
          </button>
        </div>
      ) : null}
    </nav>
  );
}
