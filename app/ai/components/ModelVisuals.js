import { getModelProvider } from "@/lib/ai/shared/models";

// 各 provider 的品牌色与字标（内置 SVG，无需外部资源）
const PROVIDER_STYLE = {
  minimax: { label: "M", bg: "linear-gradient(135deg,#ff5b4a,#d6371f)", color: "#ffffff" },
  "minimax-image": { label: "画", bg: "linear-gradient(135deg,#ff8a4a,#d65f1f)", color: "#ffffff" },
};

const FALLBACK_STYLE = { label: "AI", bg: "linear-gradient(135deg,#1677ff,#003eb3)", color: "#ffffff" };

function resolveProvider(model, provider) {
  if (provider) return provider;
  return getModelProvider(model);
}

function Glyph({ provider, size, rounded }) {
  const style = PROVIDER_STYLE[provider] || FALLBACK_STYLE;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: style.bg,
        color: style.color,
        borderRadius: rounded ? Math.round(size * 0.22) : Math.round(size * 0.3),
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        fontWeight: 800,
      }}
      className="inline-flex shrink-0 items-center justify-center"
    >
      {style.label}
    </span>
  );
}

export function ModelGlyph({ model, provider, size = 16 }) {
  return <Glyph provider={resolveProvider(model, provider)} size={size} rounded={false} />;
}

export function ModelAvatar({ model, size = 24 }) {
  return <Glyph provider={resolveProvider(model)} size={size} rounded />;
}
