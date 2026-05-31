import { LayoutGrid, ListChecks } from "lucide-react";
import { cn } from "@/fluzz/lib/utils";
import { ViewMode } from "@/fluzz/hooks/useViewMode";

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewModeToggle({ viewMode, onViewModeChange, className }: ViewModeToggleProps) {
  return (
    <div className={cn("flex items-center gap-1 p-1 bg-muted rounded-lg", className)}>
      <button
        onClick={() => onViewModeChange("management")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
          viewMode === "management"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
        title="Modo Gestão - Visualização em painel estilo Asana/Monday"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Gestão</span>
      </button>
      <button
        onClick={() => onViewModeChange("focus")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
          viewMode === "focus"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
        title="Modo Foco - Visualização minimalista estilo Todoist"
      >
        <ListChecks className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Foco</span>
      </button>
    </div>
  );
}
