import { cn } from "@/lib/utils";
import { Image as ImageIcon } from "lucide-react";

interface Props {
  count: number;
  /** ordens (1-based) que terão imagem de fundo. */
  selected: Set<number>;
  onToggle: (order: number) => void;
}

/** Grade visual dos N slides numerados. Clicar marca/desmarca imagem de fundo. */
export default function SlideGrid({ count, selected, onToggle }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {Array.from({ length: count }, (_, i) => {
        const order = i + 1;
        const active = selected.has(order);
        return (
          <button
            key={order}
            type="button"
            onClick={() => onToggle(order)}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-muted-foreground",
            )}
          >
            <span className="text-base font-semibold">{order}</span>
            <span className="mt-0.5 flex items-center gap-0.5 text-[9px] uppercase tracking-wide">
              {active ? (
                <>
                  <ImageIcon className="h-2.5 w-2.5" /> img
                </>
              ) : (
                "texto"
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
