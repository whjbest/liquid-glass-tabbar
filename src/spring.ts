export type SpringState = {
  value: number;
  velocity: number;
};

export type SpringParams = {
  /** SwiftUI-equivalent response duration in seconds (stiffness period). */
  response: number;
  /** SwiftUI-equivalent damping fraction (< 1 underdamped, 1 critical, > 1 overdamped). */
  dampingFraction: number;
};

/**
 * Exact closed-form analytical damped harmonic oscillator matching SwiftUI's
 * `.spring(response:dampingFraction:)`. Frame-rate independent across 60Hz,
 * 90Hz, and 120Hz ProMotion displays with zero numerical drift.
 */
export function stepSpring(
  state: SpringState,
  target: number,
  dt: number,
  params: SpringParams,
): SpringState {
  const clampedDt = Math.min(Math.max(dt, 0), 0.05);
  if (clampedDt === 0) return state;

  const response = Math.max(params.response, 0.02);
  const zeta = Math.max(params.dampingFraction, 0.05);
  const omega0 = (2 * Math.PI) / response;

  const x0 = state.value - target;
  const v0 = state.velocity;

  let x: number;
  let v: number;

  if (zeta < 0.999) {
    // Underdamped spring: crisp iOS bounce
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega0 * clampedDt);
    const cos = Math.cos(omegaD * clampedDt);
    const sin = Math.sin(omegaD * clampedDt);
    const b = (v0 + zeta * omega0 * x0) / omegaD;

    x = decay * (x0 * cos + b * sin);
    v =
      decay *
      ((b * omegaD - zeta * omega0 * x0) * cos -
        (x0 * omegaD + zeta * omega0 * b) * sin);
  } else if (zeta > 1.001) {
    // Overdamped spring: viscous fluid settle
    const s = omega0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * omega0 + s;
    const r2 = -zeta * omega0 - s;
    const c1 = (v0 - r2 * x0) / (r1 - r2);
    const c2 = x0 - c1;
    const e1 = Math.exp(r1 * clampedDt);
    const e2 = Math.exp(r2 * clampedDt);

    x = c1 * e1 + c2 * e2;
    v = c1 * r1 * e1 + c2 * r2 * e2;
  } else {
    // Critically damped spring
    const decay = Math.exp(-omega0 * clampedDt);
    const c2 = v0 + omega0 * x0;
    x = decay * (x0 + c2 * clampedDt);
    v = decay * (v0 - omega0 * c2 * clampedDt);
  }

  return {
    value: target + x,
    velocity: v,
  };
}

export function isSpringSettled(
  state: SpringState,
  target: number,
  positionEpsilon = 0.05,
  velocityEpsilon = 0.25,
): boolean {
  return (
    Math.abs(state.value - target) <= positionEpsilon &&
    Math.abs(state.velocity) <= velocityEpsilon
  );
}

export type RubberBandResult = {
  /** Resisted position in track coordinates. */
  value: number;
  /** Signed boundary compression ratio in [-1, 1]; 0 when inside bounds. */
  overshoot: number;
};

/**
 * Apple-style hyperbolic rubber-band resistance past the left/right edges
 * of the tab track. Returns both the clamped position and normalized overshoot
 * so the glass droplet compresses horizontally against the track boundary.
 */
export function rubberBand(
  value: number,
  min: number,
  max: number,
  dimension: number,
  coefficient = 0.55,
): RubberBandResult {
  const safeRange = Math.max(dimension * 0.42, 16);
  const resist = (distance: number) =>
    safeRange * (1 - 1 / ((distance * coefficient) / safeRange + 1));

  if (value < min) {
    const offset = resist(min - value);
    return {
      value: min - offset,
      overshoot: -Math.min(1, offset / safeRange),
    };
  }
  if (value > max) {
    const offset = resist(value - max);
    return {
      value: max + offset,
      overshoot: Math.min(1, offset / safeRange),
    };
  }
  return { value, overshoot: 0 };
}

export type LiquidDeformation = {
  scaleX: number;
  scaleY: number;
  /** Normalized directional specular shift in [-1, 1]. */
  lightOffset: number;
};

/**
 * Computes the target aspect-ratio deformation (`jellyTarget`) from horizontal
 * velocity, braking deceleration (`ax`), and boundary rubber-band overshoot.
 *
 * - Accelerating / fast flight → positive target (elongates horizontally).
 * - Braking into target tab (`vx * ax < 0`) → negative target (squishes
 *   horizontally and bulges vertically on impact like real jelly).
 * - Dragging past track ends → negative target (boundary compression).
 */
export function computeJellyTarget(
  velocityX: number,
  accelX: number,
  overshoot: number,
  intensity = 1,
): number {
  const k = Math.min(Math.max(intensity, 0), 2);
  const speedStretch = Math.tanh(Math.abs(velocityX) / 880) * 0.22 * k;
  const isBraking = velocityX * accelX < 0;
  const brakeSquish = isBraking
    ? -Math.tanh(Math.abs(accelX) / 13000) * 0.16 * k
    : 0;
  const edgeCompress = -Math.abs(overshoot) * 0.17 * k;
  return speedStretch + brakeSquish + edgeCompress;
}

/**
 * Converts a spring-driven jelly aspect value into volume-preserving
 * (`scaleX * scaleY^2 ≈ 1`) droplet scale and dynamic specular highlight offset.
 */
export function jellyToDeformation(
  jelly: number,
  velocityX: number,
  overshoot: number,
): LiquidDeformation {
  const scaleX = Math.min(Math.max(1 + jelly, 0.85), 1.24);
  const scaleY = Math.min(Math.max(1 / Math.sqrt(scaleX), 0.88), 1.1);

  const velocityBias = Math.tanh(velocityX / 850);
  const lightOffset = Math.min(
    Math.max(velocityBias * 0.8 + overshoot * 0.45, -1),
    1,
  );

  return { scaleX, scaleY, lightOffset };
}

/**
 * Memoryless convenience helper kept for backwards compatibility.
 */
export function computeLiquidDeformation(
  velocityX: number,
  overshoot: number,
  intensity = 1,
): LiquidDeformation {
  const jelly = computeJellyTarget(velocityX, 0, overshoot, intensity);
  return jellyToDeformation(jelly, velocityX, overshoot);
}
