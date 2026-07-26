import { cn } from "@/lib/utils";
import { STYLE_PREVIEWS } from "./constants";
import type { VisualStyle } from "./types";

/** Amostra visual do estilo de imagem — usada no seletor de "Estilo da imagem". */
export default function StyleSwatch({
  style,
  className,
}: {
  style: VisualStyle;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-md border border-border/50", className)}
      style={{ background: STYLE_PREVIEWS[style] }}
    />
  );
}
