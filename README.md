# liquid-glass-tabbar

High-fidelity **iOS 26 Liquid Glass TabBar** for React, engineered specifically to look and feel native on **iOS Safari & Telegram `WKWebView`** (without relying on `backdrop-filter: url(#svg)`, which WebKit drops due to WebKit Bug #245510).

- **Live iPhone / Telegram WebView Playground**: https://whjbest.github.io/liquid-glass-tabbar/

## Highlights

- **WebKit-Native Multi-Layer Optical Stack**: Combines a clear glass core chamber (`-webkit-backdrop-filter`), a separated parent-masked **Refractive Bevel Rim** (sharper, higher-saturation live sampling around the 4.5px perimeter), 3D Fresnel specular highlights, and subtle chromatic caustics. Runs smoothly at 120Hz ProMotion on iOS without DOM screenshots or CORS issues.
- **Continuous Portal Magnifier Lens**: Pressing, scrubbing, or jumping across tabs lifts the selection pill into a convex Liquid Glass droplet containing a pixel-locked, radially magnified mirror of the tab row—continuously magnifying and tinting icons and labels even halfway across tab boundaries.
- **Exact SwiftUI Spring Physics**: Zero-dependency closed-form damped harmonic spring matching SwiftUI's `.spring(response:dampingFraction:)`, driving velocity-based liquid stretch/squish, directional specular glint, and Apple hyperbolic rubber-band boundary compression.
- **iOS 26 `UISearchTab` Companion**: Built-in support for the trailing detached round Liquid Glass search button.
- **Progressive Chromium Enhancement**: Automatically layers SDF capsule `<feDisplacementMap>` backdrop refraction on Chromium engines while keeping the native GPU bevel stack on AppleWebKit.
- **Zero Runtime Dependencies**: Only `react` and `react-dom` peer dependencies; self-contained `.lgtb-*` stylesheet.

## Installation

```bash
bun add liquid-glass-tabbar
# or directly from GitHub while iterating:
bun add github:whjbest/liquid-glass-tabbar
```

## Usage

```tsx
import { useState } from "react";
import { LiquidGlassTabBar } from "liquid-glass-tabbar";
import "liquid-glass-tabbar/styles.css";

export function BottomDock() {
  const [route, setRoute] = useState("/");

  return (
    <LiquidGlassTabBar
      items={[
        { value: "/", label: "Home", icon: <HomeIcon /> },
        { value: "/square", label: "Square", icon: <SquareIcon /> },
        { value: "/profile", label: "Me", icon: <ProfileIcon /> },
      ]}
      value={route}
      onValueChange={setRoute}
      appearance="auto"
      search={{
        label: "Search",
        active: route === "/search",
        onActivate: () => setRoute("/search"),
      }}
    />
  );
}
```

## Development

```bash
bun install
bun run dev        # Start iPhone-ready playground (--host for LAN testing)
bun run check      # Typecheck, Biome lint, unit tests, lib & demo build
```

## License

MIT
