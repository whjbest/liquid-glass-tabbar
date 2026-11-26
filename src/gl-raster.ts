/**
 * Rasterizes the TabBar's own foreground (rim lines, icons, labels, badges)
 * into a canvas laid out exactly like the DOM, for the WebGL lens.
 *
 * Icons are drawn as monochrome templates (like iOS tab images) from inline
 * SVG, an <img>, or a CSS mask url. Anything else is reported as `failed`
 * so the caller keeps the DOM rendering instead.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export type RasterSource = {
  key: string;
  kind: "svg" | "img" | "mask";
  url: string;
  /** Raster size in device pixels. */
  width: number;
  height: number;
  /** Template images take the label color. */
  tint: boolean;
};

export type RasterCache = Map<string, HTMLCanvasElement>;

export type ComposeOptions = {
  track: HTMLElement;
  /** Element carrying the `--lgtb-*` tokens (the nav root). */
  root: HTMLElement;
  cache: RasterCache;
  target: HTMLCanvasElement;
  dpr: number;
  marginX: number;
  marginY: number;
};

export type ComposeResult = {
  cssWidth: number;
  cssHeight: number;
  missing: RasterSource[];
  failed: boolean;
};

type Box = { x: number; y: number; w: number; h: number };

let tintCanvas: HTMLCanvasElement | undefined;

function capsulePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const r = Math.max(0, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
}

function token(style: CSSStyleDeclaration, name: string, fallback: string) {
  return style.getPropertyValue(name).trim() || fallback;
}

function parseShadow(value: string) {
  if (!value || value === "none") return null;
  const match = value.match(
    /(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/i,
  );
  if (!match) return null;
  return {
    color: match[1] ?? "transparent",
    x: Number(match[2]),
    y: Number(match[3]),
    blur: Number(match[4]),
  };
}

function fontOf(style: CSSStyleDeclaration) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > max) {
    end--;
  }
  return `${text.slice(0, end)}…`;
}

function maskUrl(element: Element) {
  const style = getComputedStyle(element);
  const value =
    style.getPropertyValue("-webkit-mask-image") ||
    style.getPropertyValue("mask-image");
  const match = value.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
  return match?.[1];
}

/** Describes how to rasterize one icon wrapper, or null when it is empty. */
export function describeIcon(
  icon: Element,
  box: Box,
  dpr: number,
): RasterSource | null | "fail" {
  const width = Math.max(1, Math.round(box.w * dpr));
  const height = Math.max(1, Math.round(box.h * dpr));
  const isBadge = (element: Element) =>
    element.classList.contains("lgtb-badge") ||
    Boolean(element.closest(".lgtb-badge"));

  const svg = Array.from(icon.querySelectorAll("svg")).find(
    (element) => !isBadge(element) && !element.parentElement?.closest("svg"),
  );
  if (svg) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.style.color = "#000";
    const markup = new XMLSerializer().serializeToString(clone);
    return {
      key: `svg:${width}x${height}:${markup}`,
      kind: "svg",
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`,
      width,
      height,
      tint: true,
    };
  }

  const image = icon.querySelector("img");
  if (image?.currentSrc || image?.src) {
    const url = image.currentSrc || image.src;
    return {
      key: `img:${width}x${height}:${url}`,
      kind: "img",
      url,
      width,
      height,
      tint: false,
    };
  }

  for (const element of [icon, ...Array.from(icon.querySelectorAll("*"))]) {
    if (isBadge(element)) continue;
    const url = maskUrl(element);
    if (url) {
      return {
        key: `mask:${width}x${height}:${url}`,
        kind: "mask",
        url,
        width,
        height,
        tint: true,
      };
    }
  }

  const hasContent = Array.from(icon.childNodes).some((node) =>
    node.nodeType === Node.ELEMENT_NODE
      ? !isBadge(node as Element)
      : Boolean(node.textContent?.trim()),
  );
  return hasContent ? "fail" : null;
}

function loadImage(source: RasterSource) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (source.kind !== "svg") {
      try {
        if (new URL(source.url, location.href).origin !== location.origin) {
          image.crossOrigin = "anonymous";
        }
      } catch {
        // Relative or opaque URLs stay same-origin.
      }
    }
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Icon failed to load: ${source.kind}`));
    image.src = source.url;
  });
}

/** Loads icon rasters into the cache; false when any icon cannot be drawn. */
export async function loadRasterSources(
  sources: RasterSource[],
  cache: RasterCache,
): Promise<boolean> {
  const unique = new Map(sources.map((source) => [source.key, source]));
  try {
    await Promise.all(
      Array.from(unique.values()).map(async (source) => {
        if (cache.has(source.key)) return;
        const image = await loadImage(source);
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas unavailable");
        if (source.kind === "svg") {
          ctx.drawImage(image, 0, 0, source.width, source.height);
        } else {
          const iw = image.naturalWidth || source.width;
          const ih = image.naturalHeight || source.height;
          const scale = Math.min(source.width / iw, source.height / ih);
          const w = iw * scale;
          const h = ih * scale;
          ctx.drawImage(
            image,
            (source.width - w) / 2,
            (source.height - h) / 2,
            w,
            h,
          );
        }
        cache.set(source.key, canvas);
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Draws the track foreground into `target` in track CSS coordinates (plus
 * margins). Missing icon rasters are returned for the caller to load.
 */
export function composeTrackTexture({
  track,
  root,
  cache,
  target,
  dpr,
  marginX,
  marginY,
}: ComposeOptions): ComposeResult {
  const trackWidth = track.offsetWidth;
  const trackHeight = track.offsetHeight;
  const cssWidth = trackWidth + marginX * 2;
  const cssHeight = trackHeight + marginY * 2;
  const result: ComposeResult = {
    cssWidth,
    cssHeight,
    missing: [],
    failed: false,
  };

  target.width = Math.max(1, Math.round(cssWidth * dpr));
  target.height = Math.max(1, Math.round(cssHeight * dpr));
  const ctx = target.getContext("2d");
  if (!ctx || trackWidth <= 0 || trackHeight <= 0) {
    result.failed = true;
    return result;
  }
  ctx.setTransform(dpr, 0, 0, dpr, marginX * dpr, marginY * dpr);
  ctx.clearRect(-marginX, -marginY, cssWidth, cssHeight);

  const trackRect = track.getBoundingClientRect();
  const scale = trackRect.width / trackWidth || 1;
  const local = (rect: DOMRect): Box => ({
    x: (rect.left - trackRect.left) / scale,
    y: (rect.top - trackRect.top) / scale,
    w: rect.width / scale,
    h: rect.height / scale,
  });

  const rootStyle = getComputedStyle(root);

  // Specular rim lines, matching `.lgtb-specular` (154deg gradient ring).
  const specularOpacity = Number.parseFloat(
    token(rootStyle, "--lgtb-specular", "0.95"),
  );
  if (specularOpacity > 0) {
    const angle = (154 * Math.PI) / 180;
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    const length = Math.abs(trackWidth * dx) + Math.abs(trackHeight * dy);
    const cx = trackWidth / 2;
    const cy = trackHeight / 2;
    const gradient = ctx.createLinearGradient(
      cx - (dx * length) / 2,
      cy - (dy * length) / 2,
      cx + (dx * length) / 2,
      cy + (dy * length) / 2,
    );
    const mid = token(
      rootStyle,
      "--lgtb-specular-mid",
      "rgba(255,255,255,.24)",
    );
    gradient.addColorStop(
      0,
      token(rootStyle, "--lgtb-specular-top", "rgba(255,255,255,.9)"),
    );
    gradient.addColorStop(0.24, mid);
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.06)");
    gradient.addColorStop(0.76, mid);
    gradient.addColorStop(
      1,
      token(rootStyle, "--lgtb-specular-bottom", "rgba(255,255,255,.8)"),
    );
    ctx.save();
    ctx.globalAlpha = Math.min(1, specularOpacity);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.25;
    capsulePath(ctx, 0.625, 0.625, trackWidth - 1.25, trackHeight - 1.25);
    ctx.stroke();
    ctx.restore();
  }

  const foreground = token(rootStyle, "--lgtb-fg", "rgba(0,0,0,.7)");
  const foregroundActive = token(rootStyle, "--lgtb-fg-active", "#007aff");

  const buttons = Array.from(
    track.querySelectorAll<HTMLButtonElement>("button[data-tab-bar-item]"),
  );
  for (const button of buttons) {
    const color =
      button.dataset.active === "true" ? foregroundActive : foreground;
    const buttonStyle = getComputedStyle(button);
    const shadow = parseShadow(buttonStyle.textShadow);

    ctx.save();
    ctx.globalAlpha = button.disabled ? 0.42 : 1;
    if (shadow) {
      ctx.shadowColor = shadow.color;
      ctx.shadowOffsetX = shadow.x * dpr;
      ctx.shadowOffsetY = shadow.y * dpr;
      ctx.shadowBlur = shadow.blur * dpr;
    }

    const icon = button.querySelector(".lgtb-item-icon");
    if (icon) {
      const box = local(icon.getBoundingClientRect());
      const source = describeIcon(icon, box, dpr);
      if (source === "fail") {
        result.failed = true;
      } else if (source) {
        const raster = cache.get(source.key);
        if (!raster) {
          result.missing.push(source);
        } else if (source.tint) {
          tintCanvas ??= document.createElement("canvas");
          tintCanvas.width = raster.width;
          tintCanvas.height = raster.height;
          const tint = tintCanvas.getContext("2d");
          if (tint) {
            tint.clearRect(0, 0, raster.width, raster.height);
            tint.drawImage(raster, 0, 0);
            tint.globalCompositeOperation = "source-in";
            tint.fillStyle = color;
            tint.fillRect(0, 0, raster.width, raster.height);
            tint.globalCompositeOperation = "source-over";
            ctx.drawImage(tintCanvas, box.x, box.y, box.w, box.h);
          }
        } else {
          ctx.drawImage(raster, box.x, box.y, box.w, box.h);
        }
      }

      const badge = icon.querySelector<HTMLElement>(".lgtb-badge");
      if (badge) {
        const badgeBox = local(badge.getBoundingClientRect());
        const badgeStyle = getComputedStyle(badge);
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1 * dpr;
        ctx.shadowBlur = 3 * dpr;
        ctx.fillStyle = badgeStyle.backgroundColor;
        capsulePath(ctx, badgeBox.x, badgeBox.y, badgeBox.w, badgeBox.h);
        ctx.fill();
        ctx.restore();
        const text = badge.textContent?.trim();
        if (text) {
          ctx.save();
          ctx.shadowColor = "transparent";
          ctx.fillStyle = badgeStyle.color;
          ctx.font = fontOf(badgeStyle);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            text,
            badgeBox.x + badgeBox.w / 2,
            badgeBox.y + badgeBox.h / 2 + 0.5,
          );
          ctx.restore();
        }
      }
    }

    const label = button.querySelector<HTMLElement>(".lgtb-item-label");
    const text = label?.textContent?.trim();
    if (label && text) {
      const box = local(label.getBoundingClientRect());
      const labelStyle = getComputedStyle(label);
      ctx.fillStyle = color;
      ctx.font = fontOf(labelStyle);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        fitText(ctx, text, box.w + 1),
        box.x + box.w / 2,
        box.y + box.h / 2 + 0.5,
      );
    }
    ctx.restore();
  }

  return result;
}
