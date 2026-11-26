import { describe, expect, test } from "bun:test";
import {
  computeLiquidDeformation,
  isSpringSettled,
  rubberBand,
  stepSpring,
} from "../src/spring";

describe("SwiftUI analytical spring solver", () => {
  test("underdamped spring converges accurately and is frame-rate independent", () => {
    const params = { response: 0.38, dampingFraction: 0.76 };
    let at60 = { value: 0, velocity: 0 };
    let at120 = { value: 0, velocity: 0 };

    // Simulate 0.5 seconds at 60Hz vs 120Hz
    for (let i = 0; i < 30; i++) {
      at60 = stepSpring(at60, 200, 1 / 60, params);
    }
    for (let i = 0; i < 60; i++) {
      at120 = stepSpring(at120, 200, 1 / 120, params);
    }

    expect(Math.abs(at60.value - at120.value)).toBeLessThan(0.01);
    expect(Math.abs(at60.velocity - at120.velocity)).toBeLessThan(0.05);

    // Continue to 1.5s: should settle cleanly on target
    for (let i = 0; i < 60; i++) {
      at60 = stepSpring(at60, 200, 1 / 60, params);
    }
    expect(isSpringSettled(at60, 200)).toBe(true);
  });

  test("critically damped and overdamped springs settle monotonically without overshoot", () => {
    for (const dampingFraction of [1.0, 1.35]) {
      let state = { value: 0, velocity: 0 };
      for (let i = 0; i < 90; i++) {
        state = stepSpring(state, 100, 1 / 60, {
          response: 0.3,
          dampingFraction,
        });
        expect(state.value).toBeLessThanOrEqual(100.001);
      }
      expect(Math.abs(state.value - 100)).toBeLessThan(0.5);
    }
  });
});

describe("rubberBand & liquid deformation", () => {
  test("passes through values inside bounds and resists past either edge", () => {
    expect(rubberBand(120, 40, 260, 80)).toEqual({ value: 120, overshoot: 0 });

    const left = rubberBand(0, 40, 260, 80);
    expect(left.value).toBeLessThan(40);
    expect(left.value).toBeGreaterThan(0);
    expect(left.overshoot).toBeLessThan(0);

    const right = rubberBand(320, 40, 260, 80);
    expect(right.value).toBeGreaterThan(260);
    expect(right.value).toBeLessThan(320);
    expect(right.overshoot).toBeGreaterThan(0);
  });

  test("stretches horizontally under velocity and compresses at boundaries", () => {
    const fast = computeLiquidDeformation(1200, 0, 1);
    expect(fast.scaleX).toBeGreaterThan(1.05);
    expect(fast.scaleY).toBeLessThan(1);
    expect(fast.lightOffset).toBeGreaterThan(0);

    const squeezed = computeLiquidDeformation(0, 0.8, 1);
    expect(squeezed.scaleX).toBeLessThan(1);
    expect(squeezed.scaleY).toBeGreaterThan(1);
  });
});
