import type { Slide, TextAlign } from "./types";

interface Props {
  slide: Slide;
  /** total de slides do carrossel (para o badge "01/10"). */
  total?: number;
  /** lado do quadrado em px (preview). */
  size?: number;
  className?: string;
}

const VJUSTIFY: Record<string, string> = {
  top: "justify-start",
  center: "justify-center",
  full: "justify-center",
  bottom: "justify-end",
};

const HALIGN: Record<TextAlign, { items: string; text: string }> = {
  left: { items: "items-start", text: "text-left" },
  center: { items: "items-center", text: "text-center" },
  right: { items: "items-end", text: "text-right" },
};

/** Gradiente CSS espelhando o overlay do render (renderSlide). */
function overlayGradient(position: string, a: number): string {
  const dark = `rgba(0,0,0,${a})`;
  if (position === "full") return dark;
  if (position === "top")
    return `linear-gradient(to bottom, ${dark} 0%, transparent 55%, transparent 100%)`;
  if (position === "center")
    return `linear-gradient(to bottom, transparent 0%, ${dark} 50%, transparent 100%)`;
  return `linear-gradient(to bottom, transparent 0%, transparent 45%, ${dark} 100%)`;
}

/**
 * Preview WYSIWYG (CSS) de um slide 1:1 — espelha o render do canvas.
 * Usado nas miniaturas e no preview principal.
 */
export default function SlideCard({ slide, total, size = 400, className = "" }: Props) {
  const hasImg = slide.hasImage && slide.imageUrl;
  const scale = size / 1080;
  const position = slide.overlayPosition ?? "bottom";
  const intensity = slide.overlayIntensity ?? 0.85;
  const titleSize = slide.titleSize ?? 80;
  const bodySize = slide.bodySize ?? 36;
  const bold = slide.titleBold ?? true;
  const accent = slide.accentColor ?? "#3B82F6";
  const align = (slide.textAlign ?? "left") as TextAlign;
  const font = slide.fontFamily ?? "Montserrat";
  const numText = `${String(slide.order).padStart(2, "0")}/${String(
    total ?? slide.order,
  ).padStart(2, "0")}`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border ${className}`}
      style={{
        width: size,
        height: size,
        background: hasImg ? "#000" : slide.bgColor ?? "#0a0a0a",
      }}
    >
      {hasImg && (
        <>
          <img
            src={slide.imageUrl!}
            alt=""
            crossOrigin="anonymous"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: overlayGradient(position, intensity) }}
          />
        </>
      )}

      <span
        className="absolute font-semibold text-white"
        style={{
          left: 90 * scale,
          top: 90 * scale,
          fontSize: 28 * scale,
          padding: `${11 * scale}px ${16 * scale}px`,
          borderRadius: 10 * scale,
          background: "rgba(0,0,0,0.4)",
          fontFamily: font,
        }}
      >
        {numText}
      </span>

      <div
        className={`absolute inset-0 flex flex-col ${VJUSTIFY[position]} ${HALIGN[align].items} ${HALIGN[align].text}`}
        style={{ padding: 90 * scale, color: slide.textColor ?? "#ffffff", fontFamily: font }}
      >
        {slide.title && (
          <h3
            className="leading-tight"
            style={{ fontSize: titleSize * scale, fontWeight: bold ? 700 : 400 }}
          >
            {slide.title}
          </h3>
        )}
        {slide.title && (
          <div
            style={{
              width: 80 * scale,
              height: 3 * scale,
              background: accent,
              borderRadius: 2 * scale,
              marginTop: 20 * scale,
            }}
          />
        )}
        {slide.body && (
          <p
            className="leading-snug"
            style={{ fontSize: bodySize * scale, marginTop: 24 * scale, opacity: 0.9 }}
          >
            {slide.body}
          </p>
        )}
      </div>
    </div>
  );
}
