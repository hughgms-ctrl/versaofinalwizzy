import React, { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { Sheet, SheetContent } from "@/fluzz/components/ui/sheet";
import { AIChatPanel } from "./AIChatPanel";
import { cn } from "@/fluzz/lib/utils";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

interface AIFloatingButtonProps {
  className?: string;
}

export function AIFloatingButton({ className }: AIFloatingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<"bottom-right" | "bottom-left" | "top-right" | "hidden">("bottom-left");
  const { permissions } = useWorkspace();

  useEffect(() => {
    const saved = localStorage.getItem("fluzz-ai-floating-position");
    if (saved === "bottom-right" || saved === "bottom-left" || saved === "top-right" || saved === "hidden") {
      setPosition(saved);
    }
  }, []);

  const cyclePosition = () => {
    const next = position === "bottom-left" ? "top-right" : position === "top-right" ? "bottom-right" : "bottom-left";
    setPosition(next);
    localStorage.setItem("fluzz-ai-floating-position", next);
  };

  // Respect user's AI visibility preference (even for admins)
  if (permissions?.can_view_ai === false || position === "hidden") {
    return null;
  }

  const positionClass = {
    "bottom-right": "bottom-6 right-6",
    "bottom-left": "bottom-6 left-6",
    "top-right": "top-20 right-6",
  }[position];

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed h-14 w-14 rounded-full shadow-lg z-50",
          "bg-primary hover:bg-primary/90",
          positionClass,
          className
        )}
        size="icon"
        onContextMenu={(event) => {
          event.preventDefault();
          cyclePosition();
        }}
        onDoubleClick={cyclePosition}
        title="Flow AI - clique duas vezes para mudar de posição"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right" className="w-full sm:w-[450px] p-0">
          <AIChatPanel onClose={() => setIsOpen(false)} showCloseButton />
        </SheetContent>
      </Sheet>
    </>
  );
}
