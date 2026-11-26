/**
 * Physical Liquid Glass Optics Engine (v0.3)
 *
 * Calibrated directly against native iOS 26 UITabBar Liquid Glass:
 * - Track: gentle convex bevel refraction along the floating pill perimeter.
 * - Lifted Droplet ("lens"): crystal-clear zero-blur center with smooth
 *   Snell's Law peripheral bending and delicate pastel RGB prism dispersion,
 *   refracting the TabBar's own top/bottom edges, outside page background,
 *   and tab icons in a single optical pass (zero ghosting).
 */

let cachedSvgBackdropSupport: boolean | undefined;
let filterCounter = 0;

/**
 * Detects whether the current engine genuinely paints SVG filters inside
 * CSS `backdrop-filter: url(#...)`.
 * AppleWebKit (iOS Safari / WKWebView) parses the syntax but does not paint
 * SVG backdrop filters (WebKit #245510).
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

/**
 * Smooth C2 convex squircle surface profile passed through Snell's Law
 * (`n1 * sin(theta_i) = n2 * sin(theta_t)`) to compute physically accurate
 * inward ray deflection near the curved glass rim.
 */
function snellDeflection(
  depthFromEdge: number,
  bevelWidth: number,
  ior = 1.48,
): number {
  const t = Math.max(
    0.02,
    Math.min(1, depthFromEdge / Math.max(bevelWidth, 1)),
  );
  if (t >= 1) return 0;

  // Smoothstep-damped squircle slope avoids harsh pixel stepping at the very edge
  const u = 1 - t;
  const u3 = u * u * u;
  const u4 = u3 * u;
  const slope = u3 / Math.max((1 - u4) ** 0.75, 0.14);

  const thetaI = Math.min(Math.atan(slope * 1.45), 1.24);
  const sinThetaT = Math.min(Math.sin(thetaI) / ior, 0.98);
  const thetaT = Math.asin(sinThetaT);
  const deflectionAngle = thetaI - thetaT;

  // Smooth C1 cubic falloff into the flat crystal core
  const falloff = u * u * (3 - 2 * u);
  return Math.tan(deflectionAngle) * falloff;
}

export type SdfRefractionOptions = {
  width: number;
  height: number;
  blur: number;
  refraction: number;
  chromaticAberration: number;
  /** "track" for the base floating capsule; "lens" for the elevated droplet. */
  profile?: "track" | "lens";
};

export type SdfRefractionHandle = {
  filterUrl: string;
  destroy: () => void;
};

/**
 * Generates a high-precision Snell's Law SDF displacement map + delicate
 * 3-channel pastel RGB dispersion SVG `<filter>` for Chromium live backdrop
 * refraction.
 */
export function createCapsuleRefractionFilter(
  ownerDocument: Document,
  options: SdfRefractionOptions,
): SdfRefractionHandle | null {
  const {
    width,
    height,
    blur,
    refraction,
    chromaticAberration,
    profile = "track",
  } = options;

  if (width <= 4 || height <= 4 || refraction <= 0.01) return null;
  if (!supportsSvgBackdropRefraction()) return null;

  const scale = Math.min(2, 640 / Math.max(width, height));
  const cw = Math.max(4, Math.ceil(width * scale));
  const ch = Math.max(4, Math.ceil(height * scale));
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const radius = Math.min(width, height) / 2;
  // Lens uses a refined ~26% peripheral bevel so the center stays razor-sharp
  // while the top, bottom, and rounded ends smoothly pull in & bend edges.
  const bevel =
    profile === "lens"
      ? Math.min(20, Math.min(width, height) * 0.28)
      : Math.min(18, Math.min(width, height) * 0.3);

  const fieldX = new Float32Array(cw * ch);
  const fieldY = new Float32Array(cw * ch);
  let maxMag = 0.0001;

  for (let py = 0; py < ch; py++) {
    const y = ((py + 0.5) * height) / ch;
    for (let px = 0; px < cw; px++) {
      const x = ((px + 0.5) * width) / cw;
      const idx = py * cw + px;
      const dist = capsuleSdf(x, y, width, height, radius);

      let dx = 0;
      let dy = 0;

      if (dist <= 0) {
        const depth = -dist;
        if (depth < bevel) {
          const gx =
            capsuleSdf(x + 0.5, y, width, height, radius) -
            capsuleSdf(x - 0.5, y, width, height, radius);
          const gy =
            capsuleSdf(x, y + 0.5, width, height, radius) -
            capsuleSdf(x, y - 0.5, width, height, radius);
          const len = Math.hypot(gx, gy) || 1;
          const mag = snellDeflection(depth, bevel, 1.48);
          dx = (-gx / len) * mag;
          dy = (-gy / len) * mag;
        }

        // Subtle convex magnification across the lens dome (keeps icons sharp & natural)
        const domeStrength = profile === "lens" ? 0.11 : 0.03;
        const nx = (x - width / 2) / Math.max(width / 2, 1);
        const ny = (y - height / 2) / Math.max(height / 2, 1);
        dx += -nx * domeStrength;
        dy += -ny * domeStrength;
      }

      fieldX[idx] = dx;
      fieldY[idx] = dy;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      if (m > maxMag) maxMag = m;
    }
  }

  const img = ctx.createImageData(cw, ch);
  for (let i = 0; i < cw * ch; i++) {
    const nx = (fieldX[i] ?? 0) / maxMag;
    const ny = (fieldY[i] ?? 0) / maxMag;
    const o = i * 4;
    img.data[o] = Math.max(0, Math.min(255, Math.round(128 + nx * 126)));
    img.data[o + 1] = Math.max(0, Math.min(255, Math.round(128 + ny * 126)));
    img.data[o + 2] = 128;
    img.data[o + 3] = 255;
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

  const id = `lgtb-snell-${++filterCounter}`;

  // Calibrated displacement: bold enough to visibly pull & curve the TabBar's
  // top/bottom edge into the overhanging meniscus, while staying silky smooth.
  const baseScale =
    (profile === "lens" ? 28 : 34) * Math.max(0, Math.min(1.5, refraction));
  // Lifted lens keeps near-zero blur so text inside the droplet stays razor-sharp
  const stdDev =
    profile === "lens" ? Math.max(0, blur * 0.08) : Math.max(0, blur * 0.28);

  // Delicate pastel prism dispersion (~2.5–3.5px max R-to-B spread, like iOS 26)
  const dispersionSpread =
    Math.max(0, Math.min(1, chromaticAberration)) *
    (profile === "lens" ? 0.065 : 0.055);
  const scaleR = (baseScale * (1 - dispersionSpread)).toFixed(2);
  const scaleG = baseScale.toFixed(2);
  const scaleB = (baseScale * (1 + dispersionSpread)).toFixed(2);

  const margin = Math.ceil(baseScale * (1 + dispersionSpread) + stdDev * 3 + 6);

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

  const blurStep =
    stdDev > 0.06
      ? `<feGaussianBlur in="SourceGraphic" stdDeviation="${stdDev.toFixed(2)}" result="src"/>`
      : `<feOffset in="SourceGraphic" dx="0" dy="0" result="src"/>`;

  if (dispersionSpread > 0.004) {
    filter.innerHTML = [
      blurStep,
      `<feImage href="${dataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>`,
      `<feDisplacementMap in="src" in2="map" scale="${scaleR}" xChannelSelector="R" yChannelSelector="G" result="dispR"/>`,
      `<feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanR"/>`,
      `<feDisplacementMap in="src" in2="map" scale="${scaleG}" xChannelSelector="R" yChannelSelector="G" result="dispG"/>`,
      `<feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanG"/>`,
      `<feDisplacementMap in="src" in2="map" scale="${scaleB}" xChannelSelector="R" yChannelSelector="G" result="dispB"/>`,
      `<feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chanB"/>`,
      `<feBlend in="chanR" in2="chanG" mode="screen" result="rg"/>`,
      `<feBlend in="rg" in2="chanB" mode="screen"/>`,
    ].join("");
  } else {
    filter.innerHTML = [
      blurStep,
      `<feImage href="${dataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>`,
      `<feDisplacementMap in="src" in2="map" scale="${scaleG}" xChannelSelector="R" yChannelSelector="G"/>`,
    ].join("");
  }

  svg.appendChild(filter);
  ownerDocument.body.appendChild(svg);

  return {
    filterUrl: `url("#${id}")`,
    destroy: () => {
      svg.remove();
    },
  };
}
