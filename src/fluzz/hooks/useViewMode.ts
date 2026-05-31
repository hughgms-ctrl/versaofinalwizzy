import { useViewModeContext, type ViewMode } from "@/fluzz/contexts/ViewModeContext";

export type { ViewMode };

export function useViewMode() {
  return useViewModeContext();
}
