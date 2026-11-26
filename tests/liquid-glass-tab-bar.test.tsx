import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LiquidGlassTabBar } from "../src/liquid-glass-tab-bar";

const sampleItems = [
  { value: "/", label: "Home" },
  { value: "/square", label: "Square", badge: 2 },
  { value: "/profile", label: "Me" },
];

describe("LiquidGlassTabBar markup & DOM contract", () => {
  test("renders exact button count and preserves portal mirror isolation", () => {
    const html = renderToStaticMarkup(
      <LiquidGlassTabBar
        items={sampleItems}
        value="/square"
        onValueChange={() => {}}
        appearance="dark"
        search={{ label: "Search", active: false, onActivate: () => {} }}
      />,
    );

    // Crucial contract: portal mirror must NOT emit button[data-tab-bar-item]
    const tabButtons =
      html.match(/<button[^>]*data-tab-bar-item="[^"]*"[^>]*>/g) ?? [];
    expect(tabButtons.length).toBe(3);

    expect(html).toContain('data-slot="tab-bar"');
    expect(html).toContain('data-slot="tab-bar-list"');
    expect(html).toContain('data-slot="tab-bar-indicator"');
    expect(html).toContain('data-slot="tab-bar-lens-mirror"');
    expect(html).toContain('data-slot="tab-bar-search"');
    expect(html).toContain('data-appearance="dark"');
    expect(html).toContain('aria-current="page"');
  });

  test("supports search-active state where no track item is active", () => {
    const html = renderToStaticMarkup(
      <LiquidGlassTabBar
        items={sampleItems}
        value="/search"
        onValueChange={() => {}}
        appearance="light"
        search={{ label: "Search", active: true, onActivate: () => {} }}
      />,
    );

    expect(html).toContain('data-search-active="true"');
    expect(html).toContain('data-slot="tab-bar-search" data-active="true"');
    expect(html).not.toContain('aria-current="page"');
  });

  test("returns empty markup when items array is empty", () => {
    const html = renderToStaticMarkup(
      <LiquidGlassTabBar items={[]} value="" onValueChange={() => {}} />,
    );
    expect(html).toBe("");
  });
});
