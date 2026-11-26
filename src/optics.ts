/**
 * Optical helpers for dual-engine Liquid Glass rendering:
 * 1. Universal / iOS WebKit: GPU-composited multi-layer clear chamber +
 *    outer refractive bevel ring + procedural Fresnel specular rim.
 * 2. Progressive Chromium enhancement: optional real SDF capsule normal-map
 *    `<feDisplacementMap>` SVG filter for `backdrop-filter: url(#...)`.
 */

let cachedSvgBackdropSupport: boolean | undefined;
let filterCounter = 0;

/**
 * Detects whether the current engine genuinely paints SVG filters inside
 * CSS `backdrop-filter: url(#...)`.
 * AppleWebKit (iOS Safari, WKWebView, macOS Safari) parses the syntax but
 * silently drops SVG backdrop filters (WebKit #245510), so we exclude it
 * and rely on our native GPU multi-layer bevel ring instead.
 */
export function supportsSvgBackdropRefraction(): boolean {
  if (cachedSvgBackdropSupport !== undefined) return cachedSvgBackdropSupport;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  const isAppleWebKit =
    /AppleWebKit\//.test(ua) && !/(Chrome|Chromium|Edg|OPR)\//.test(ua);
  if (isAppleWebKit) {
    cachedSvgBackdropSupport = false;
    return false;
  }
  const supported = Boolean(
    window.CSS?.supports?.("backdrop-filter", 'url("#lgtb-probe")'),
  );
  cachedSvgBackdropSupport = supported;
  return supported;
}

/** Signed distance to a rounded pill/capsule box (negative inside). */
function capsuleSdf(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): number {
  const r = Math.min(radius, width / 2, height / 2);
  const qx = Math.abs(x - width / 2) - (width / 2 - r);
  const qy = Math.abs(y - height / 2) - (height / 2 - r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  );
}

/** Smooth cubic bevel profile from 1 at the rim to 0 inside the flat core. */
function bevelProfile(depth: number, bevelWidth: number): number {
  const t = Math.max(0, Math.min(1, depth / Math.max(bevelWidth, 1)));
  return 1 - t * t * (3 - 2 * t);
}

export type SdfRefractionHandle = {
  filterUrl: string;
  destroy: () => void;
};

/**
 * Creates a lightweight capsule SDF displacement map SVG filter for Chromium
 * progressive enhancement. Never runs on iOS/Safari WebKit.
 */
export function createCapsuleRefractionFilter(
  ownerDocument: Document,
  width: number,
  height: number,
  blur: number,
  refraction: number,
): SdfRefractionHandle | null {
  if (width <= 2 || height <= 2 || refraction <= 0.01) return null;
  if (!supportsSvgBackdropRefraction()) return null;

  const scale = Math.min(1.5, 512 / Math.max(width, height));
  const cw = Math.max(2, Math.ceil(width * scale));
  const ch = Math.max(2, Math.ceil(height * scale));
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const radius = Math.min(width, height) / 2;
  const bevel = Math.min(14, Math.min(width, height) * 0.22);
  const img = ctx.createImageData(cw, ch);

  for (let py = 0; py < ch; py++) {
    const y = ((py + 0.5) * height) / ch;
    for (let px = 0; px < cw; px++) {
      const x = ((px + 0.5) * width) / cw;
      const dist = capsuleSdf(x, y, width, height, radius);
      const offset = (py * cw + px) * 4;
      if (dist <= -bevel) {
        img.data[offset] = 128;
        img.data[offset + 1] = 128;
        img.data[offset + 2] = 128;
        img.data[offset + 3] = 255;
        continue;
      }
      const gx =
        capsuleSdf(x + 0.5, y, width, height, radius) -
        capsuleSdf(x - 0.5, y, width, height, radius);
      const gy =
        capsuleSdf(x, y + 0.5, width, height, radius) -
        capsuleSdf(x, y - 0.5, width, height, radius);
      const len = Math.hypot(gx, gy) || 1;
      const mag = bevelProfile(Math.max(-dist, 0), bevel) * 0.48;
      const dx = (-gx / len) * mag;
      const dy = (-gy / len) * mag;
      img.data[offset] = Math.round(128 + dx * 255);
      img.data[offset + 1] = Math.round(128 + dy * 255);
      img.data[offset + 2] = 128;
      img.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const dataUri = canvas.toDataURL("image/png");

  const svg = ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-lgtb-svg-filter", "true");
  svg.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";

  const id = `lgtb-refract-${++filterCounter}`;
  const strength = Math.round(refraction * 22 * 10) / 10;
  const stdDev = Math.max(0.5, blur * 0.35);
  const margin = Math.ceil(strength + stdDev * 3 + 4);

  const filter = ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "filter",
  );
  filter.setAttribute("id", id);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("x", String(-margin));
  filter.setAttribute("y", String(-margin));
  filter.setAttribute("width", String(width + margin * 2));
  filter.setAttribute("height", String(height + margin * 2));
  filter.setAttribute("color-interpolation-filters", "sRGB");
  filter.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${stdDev}" result="blurred"/><feImage href="${dataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="blurred" in2="map" scale="${strength}" xChannelSelector="R" yChannelSelector="G"/>`;

  svg.appendChild(filter);
  ownerDocument.body.appendChild(svg);

  return {
    filterUrl: `url("#${id}")`,
    destroy: () => {
      svg.remove();
    },
  };
}
