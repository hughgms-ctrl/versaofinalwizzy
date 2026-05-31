import * as React from "react";

export type ViewMode = "management" | "focus";

type ViewModeContextValue = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  hideCompleted: boolean;
  setHideCompleted: (hide: boolean) => void;
  isLoading: boolean;
};

const ViewModeContext = React.createContext<ViewModeContextValue | undefined>(undefined);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = React.useState<ViewMode>(() => {
    const saved = localStorage.getItem("viewMode");
    return (saved as ViewMode) || "management";
  });

  const [hideCompleted, setHideCompletedState] = React.useState<boolean>(() => {
    return localStorage.getItem("hideCompleted") === "true";
  });

  const setViewMode = React.useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem("viewMode", mode);
  }, []);

  const setHideCompleted = React.useCallback((hide: boolean) => {
    setHideCompletedState(hide);
    localStorage.setItem("hideCompleted", String(hide));
  }, []);

  // Keep multiple hook consumers (and other tabs) in sync.
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "viewMode" && (e.newValue === "management" || e.newValue === "focus")) {
        setViewModeState(e.newValue);
      }
      if (e.key === "hideCompleted" && (e.newValue === "true" || e.newValue === "false")) {
        setHideCompletedState(e.newValue === "true");
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = React.useMemo<ViewModeContextValue>(
    () => ({
      viewMode,
      setViewMode,
      hideCompleted,
      setHideCompleted,
      isLoading: false,
    }),
    [hideCompleted, setHideCompleted, setViewMode, viewMode],
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewModeContext() {
  const ctx = React.useContext(ViewModeContext);
  if (!ctx) {
    throw new Error("useViewMode must be used within a ViewModeProvider");
  }
  return ctx;
}
