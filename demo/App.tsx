import {
  LIQUID_GLASS_DEFAULTS,
  type LiquidGlassConfig,
  type LiquidGlassHapticKind,
  type LiquidGlassSize,
  LiquidGlassTabBar,
  type LiquidGlassTabItem,
  supportsSvgBackdropRefraction,
} from "liquid-glass-tabbar";
import { useEffect, useMemo, useState } from "react";

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      ready?: () => void;
      expand?: () => void;
      HapticFeedback?: {
        selectionChanged?: () => void;
        impactOccurred?: (style: "light" | "medium" | "heavy") => void;
      };
    };
  };
};

function triggerDemoHaptic(kind: LiquidGlassHapticKind) {
  const haptic = (window as TelegramWindow).Telegram?.WebApp?.HapticFeedback;
  try {
    if (kind === "selection") haptic?.selectionChanged?.();
    else if (kind === "press") haptic?.impactOccurred?.("medium");
    else haptic?.impactOccurred?.("light");
  } catch {
    // Ignore outside Telegram
  }
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
      <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
    </svg>
  );
}

function SquareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.273 5.625A4.483 4.483 0 0 1 5.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0 0 18.75 3H5.25a3 3 0 0 0-2.977 2.625ZM2.273 8.625A4.483 4.483 0 0 1 5.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0 0 18.75 6H5.25a3 3 0 0 0-2.977 2.625ZM5.25 9a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h13.5a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H15a.75.75 0 0 0-.75.75 2.25 2.25 0 0 1-4.5 0A.75.75 0 0 0 9 9H5.25Z" />
    </svg>
  );
}

const ALL_TABS: readonly LiquidGlassTabItem[] = [
  { value: "/", label: "Home", icon: <HomeIcon /> },
  { value: "/square", label: "Square", icon: <SquareIcon />, badge: 3 },
  { value: "/profile", label: "Me", icon: <ProfileIcon /> },
  { value: "/live", label: "Live", icon: <FlameIcon />, badge: "" },
  { value: "/wallet", label: "Wallet", icon: <WalletIcon /> },
];

const FEED_CARDS = [
  {
    id: 1,
    tag: "CRYPTO · 15M",
    color: "#00d9ff",
    bg: "linear-gradient(90deg, #00d9ff, #3b82f6)",
    stat: "$1.84M Vol",
    title: "Bitcoin above $118,500 at 00:00 UTC?",
    yes: "64¢",
    no: "36¢",
  },
  {
    id: 2,
    tag: "ESPORTS · MAJOR",
    color: "#ff3b7f",
    bg: "linear-gradient(90deg, #ff3b7f, #ff8a00)",
    stat: "$920K Vol",
    title: "Team Vitality wins Grand Final Map 1?",
    yes: "58¢",
    no: "42¢",
  },
  {
    id: 3,
    tag: "MACRO · FED",
    color: "#22c55e",
    bg: "linear-gradient(90deg, #22c55e, #06b6d4)",
    stat: "$4.12M Vol",
    title: "25 bps rate cut announced at next FOMC meeting?",
    yes: "71¢",
    no: "29¢",
  },
  {
    id: 4,
    tag: "AI · MODELS",
    color: "#a855f7",
    bg: "linear-gradient(90deg, #a855f7, #ec4899)",
    stat: "$640K Vol",
    title: "Open-weight model tops coding benchmark this quarter?",
    yes: "49¢",
    no: "51¢",
  },
  {
    id: 5,
    tag: "SPORTS · UCL",
    color: "#f59e0b",
    bg: "linear-gradient(90deg, #f59e0b, #ef4444)",
    stat: "$2.35M Vol",
    title: "Over 2.5 total goals scored in tonight's quarter-final?",
    yes: "55¢",
    no: "45¢",
  },
  {
    id: 6,
    tag: "TECH · APPLE",
    color: "#38bdf8",
    bg: "linear-gradient(90deg, #38bdf8, #818cf8)",
    stat: "$1.10M Vol",
    title: "Scroll these bright tiles slowly beneath the floating glass dock",
    yes: "82¢",
    no: "18¢",
  },
];

const SWATCHES = [
  { label: "Cyan", bg: "linear-gradient(145deg, #00e5ff, #007aff)" },
  { label: "Coral", bg: "linear-gradient(145deg, #ff6b6b, #ff2d55)" },
  { label: "Mint", bg: "linear-gradient(145deg, #34d399, #059669)" },
  { label: "Violet", bg: "linear-gradient(145deg, #c084fc, #6366f1)" },
  { label: "Amber", bg: "linear-gradient(145deg, #fbbf24, #f97316)" },
];

export function App() {
  const [appearance, setAppearance] = useState<"dark" | "light">("dark");
  const [variant, setVariant] = useState<"liquid" | "frosted">("liquid");
  const [activeRoute, setActiveRoute] = useState<string>("/");
  const [tabCount, setTabCount] = useState<3 | 4 | 5>(3);
  const [showSearch, setShowSearch] = useState(true);
  const [size, setSize] = useState<LiquidGlassSize>("default");
  const [tuningOpen, setTuningOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<LiquidGlassConfig>({
    ...LIQUID_GLASS_DEFAULTS,
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", appearance === "dark");
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    themeMeta?.setAttribute(
      "content",
      appearance === "dark" ? "#000000" : "#f3f4f7",
    );
  }, [appearance]);

  useEffect(() => {
    const tg = (window as TelegramWindow).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
  }, []);

  const items = useMemo(() => ALL_TABS.slice(0, tabCount), [tabCount]);
  const engineLabel = useMemo(
    () =>
      supportsSvgBackdropRefraction()
        ? "Chromium SDF + GPU Rim"
        : "WebKit GPU Rim + Portal Lens",
    [],
  );

  const updateConfig = <K extends keyof LiquidGlassConfig>(
    key: K,
    val: LiquidGlassConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: val }));
  };

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be blocked in non-HTTPS contexts
    }
  };

  return (
    <div className="demo-page">
      <header className="demo-topbar">
        <div className="demo-pill-group">
          <button
            type="button"
            className="demo-chip"
            data-active={variant === "liquid"}
            onClick={() => setVariant("liquid")}
          >
            Liquid Glass
          </button>
          <button
            type="button"
            className="demo-chip"
            data-active={variant === "frosted"}
            onClick={() => setVariant("frosted")}
          >
            Frosted
          </button>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="demo-tune-btn"
            onClick={() =>
              setAppearance((prev) => (prev === "dark" ? "light" : "dark"))
            }
          >
            {appearance === "dark" ? "Dark" : "Light"}
          </button>
          <button
            type="button"
            className="demo-tune-btn"
            onClick={() => setTuningOpen(true)}
          >
            Tune
          </button>
        </div>
      </header>

      <section className="demo-hero" data-route={activeRoute}>
        <div className="demo-hero-badge">iOS 26 · LIQUID GLASS TABBAR</div>
        <h1>
          {activeRoute === "/search"
            ? "Search Destination"
            : `${ALL_TABS.find((t) => t.value === activeRoute)?.label ?? "Home"} Feed`}
        </h1>
        <p>
          Press &amp; scrub across the bottom bar to feel the lifted magnifying
          droplet, velocity stretch, rubber-band edge squish, and live rim
          refraction.
        </p>
        <div className="demo-meta-row">
          <span className="demo-meta-pill">Engine: {engineLabel}</span>
          <span className="demo-meta-pill">Route: {activeRoute}</span>
        </div>
      </section>

      <div className="demo-feed">
        <div className="demo-card">
          <div className="demo-card-head">
            <span className="demo-card-tag" style={{ color: "#38bdf8" }}>
              OPTICAL REFRACTION TEST STRIP
            </span>
            <span className="demo-card-stat">Scroll under dock</span>
          </div>
          <div className="demo-swatch-strip">
            {SWATCHES.map((s) => (
              <div
                key={s.label}
                className="demo-swatch"
                style={{ background: s.bg }}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {FEED_CARDS.map((card) => (
          <article key={card.id} className="demo-card">
            <div className="demo-card-accent" style={{ background: card.bg }} />
            <div className="demo-card-head">
              <span className="demo-card-tag" style={{ color: card.color }}>
                {card.tag}
              </span>
              <span className="demo-card-stat">{card.stat}</span>
            </div>
            <h2 className="demo-card-title">{card.title}</h2>
            <div className="demo-odds-row">
              <div
                className="demo-odds-pill"
                style={{
                  background: "rgba(34, 197, 94, 0.14)",
                  color: "#22c55e",
                }}
              >
                <span>Yes</span>
                <span>{card.yes}</span>
              </div>
              <div
                className="demo-odds-pill"
                style={{
                  background: "rgba(239, 68, 68, 0.14)",
                  color: "#ef4444",
                }}
              >
                <span>No</span>
                <span>{card.no}</span>
              </div>
            </div>
          </article>
        ))}

        <div className="demo-card">
          <div className="demo-swatch-strip">
            {SWATCHES.slice()
              .reverse()
              .map((s) => (
                <div
                  key={s.label}
                  className="demo-swatch"
                  style={{ background: s.bg }}
                >
                  {s.label}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Floating Bottom Liquid Glass Dock */}
      <footer className="demo-dock">
        <div className="demo-dock-inner">
          <LiquidGlassTabBar
            items={items}
            value={activeRoute}
            onValueChange={setActiveRoute}
            onHaptic={triggerDemoHaptic}
            appearance={appearance}
            variant={variant}
            size={size}
            glass={config}
            search={
              showSearch
                ? {
                    label: "Search",
                    active: activeRoute === "/search",
                    onActivate: () => setActiveRoute("/search"),
                  }
                : undefined
            }
          />
        </div>
      </footer>

      {/* Tuning Drawer */}
      {tuningOpen ? (
        // biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop dismissal paired with Close button.
        // biome-ignore lint/a11y/noStaticElementInteractions: Standard modal backdrop.
        <div
          className="demo-sheet-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTuningOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-label="Liquid Glass Tuning"
            className="demo-sheet"
          >
            <div className="demo-sheet-head">
              <h2>Optics &amp; Spring Tuning</h2>
              <div className="demo-sheet-actions">
                <button
                  type="button"
                  className="demo-tune-btn"
                  onClick={copyConfig}
                >
                  {copied ? "Copied" : "Copy JSON"}
                </button>
                <button
                  type="button"
                  className="demo-tune-btn"
                  onClick={() => setConfig({ ...LIQUID_GLASS_DEFAULTS })}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="demo-tune-btn"
                  onClick={() => setTuningOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>

            <div className="demo-toggle-bar">
              <div className="demo-pill-group">
                {([3, 4, 5] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    className="demo-chip"
                    data-active={tabCount === count}
                    onClick={() => {
                      setTabCount(count);
                      if (
                        activeRoute !== "/search" &&
                        !ALL_TABS.slice(0, count).some(
                          (t) => t.value === activeRoute,
                        )
                      ) {
                        setActiveRoute("/");
                      }
                    }}
                  >
                    {count} Tabs
                  </button>
                ))}
              </div>
              <div className="demo-pill-group">
                {(["sm", "default", "lg"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="demo-chip"
                    data-active={size === preset}
                    onClick={() => setSize(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="demo-tune-btn"
                onClick={() => setShowSearch((prev) => !prev)}
              >
                Search: {showSearch ? "On" : "Off"}
              </button>
            </div>

            <div className="demo-slider-grid">
              <Slider
                label="Interior Blur"
                value={config.blur ?? LIQUID_GLASS_DEFAULTS.blur}
                min={4}
                max={28}
                step={0.5}
                unit="px"
                onChange={(v) => updateConfig("blur", v)}
              />
              <Slider
                label="Refractive Rim Blur"
                value={config.rimBlur ?? LIQUID_GLASS_DEFAULTS.rimBlur}
                min={0.5}
                max={6}
                step={0.25}
                unit="px"
                onChange={(v) => updateConfig("rimBlur", v)}
              />
              <Slider
                label="Refraction & Chromatic Fringe"
                value={config.refraction ?? LIQUID_GLASS_DEFAULTS.refraction}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateConfig("refraction", v)}
              />
              <Slider
                label="Specular Fresnel Bevel"
                value={config.specular ?? LIQUID_GLASS_DEFAULTS.specular}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateConfig("specular", v)}
              />
              <Slider
                label="Lens Magnification"
                value={
                  config.lensMagnification ??
                  LIQUID_GLASS_DEFAULTS.lensMagnification
                }
                min={1}
                max={1.32}
                step={0.02}
                unit="x"
                onChange={(v) => updateConfig("lensMagnification", v)}
              />
              <Slider
                label="Spring Response (SwiftUI)"
                value={
                  config.springResponse ?? LIQUID_GLASS_DEFAULTS.springResponse
                }
                min={0.18}
                max={0.7}
                step={0.02}
                unit="s"
                onChange={(v) => updateConfig("springResponse", v)}
              />
              <Slider
                label="Spring Damping Fraction"
                value={
                  config.springDamping ?? LIQUID_GLASS_DEFAULTS.springDamping
                }
                min={0.5}
                max={1.1}
                step={0.02}
                onChange={(v) => updateConfig("springDamping", v)}
              />
              <Slider
                label="Liquid Squish & Stretch"
                value={
                  config.squishIntensity ??
                  LIQUID_GLASS_DEFAULTS.squishIntensity
                }
                min={0}
                max={1.8}
                step={0.05}
                onChange={(v) => updateConfig("squishIntensity", v)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="demo-control-row">
      <div className="demo-control-label">
        <span>{label}</span>
        <span>
          {value.toFixed(step >= 1 ? 0 : 2)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
