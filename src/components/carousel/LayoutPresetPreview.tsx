import { cn } from "@/lib/utils";
import type { LayoutPreset } from "./constants";

const VJUSTIFY: Record<string, string> = {
  top: "justify-start",
  center: "justify-center",
  full: "justify-center",
  bottom: "justify-end",
};

const HALIGN: Record<string, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

/** Espelha a mecânica de overlayGradient do SlideCard, só que como mockup estático do preset. */
function overlayGradient(position: string, a: number): string {
  const dark = `rgba(0,0,0,${a})`;
  if (position === "full") return dark;
  if (position === "top") return `linear-gradient(to bottom, ${dark} 0%, transparent 60%)`;
  if (position === "center")
    return `linear-gradient(to bottom, transparent 0%, ${dark} 50%, transparent 100%)`;
  return `linear-gradient(to bottom, transparent 0%, transparent 45%, ${dark} 100%)`;
}

/** Mockup em miniatura de um LayoutPreset — mostra posição do overlay e do bloco de texto. */
export default function LayoutPresetPreview({
  preset,
  className,
}: {
  preset: LayoutPreset;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-gradient-to-br from-slate-500 to-slate-800",
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{ background: overlayGradient(preset.overlayPosition, preset.overlayIntensity) }}
      />
      <div
        className={cn(
          "absolute inset-0 flex flex-col gap-1 p-2",
          VJUSTIFY[preset.overlayPosition],
          HALIGN[preset.textAlign],
        )}
      >
        <div
          className="rounded-sm bg-white/90"
          style={{ height: Math.max(3, preset.titleSize / 12), width: "60%" }}
        />
        <div
          className="rounded-sm bg-white/60"
          style={{ height: Math.max(2, preset.bodySize / 14), width: "45%" }}
        />
      </div>
    </div>
  );
}
