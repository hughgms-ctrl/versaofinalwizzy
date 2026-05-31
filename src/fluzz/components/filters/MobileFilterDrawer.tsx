import { ReactNode } from "react";
import { Button } from "@/fluzz/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/fluzz/components/ui/sheet";
import { Filter } from "lucide-react";
import { Badge } from "@/fluzz/components/ui/badge";

interface MobileFilterDrawerProps {
  children: ReactNode;
  title?: string;
  description?: string;
  activeFiltersCount?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const MobileFilterDrawer = ({
  children,
  title = "Filtros",
  description = "Filtre e organize os resultados",
  activeFiltersCount = 0,
  open,
  onOpenChange,
}: MobileFilterDrawerProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full md:hidden gap-2 relative">
          <Filter className="h-4 w-4" />
          {title}
          {activeFiltersCount > 0 && (
            <Badge variant="destructive" className="ml-auto h-5 w-5 flex items-center justify-center p-0 text-xs">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            {title}
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount} {activeFiltersCount === 1 ? "filtro ativo" : "filtros ativos"}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="mt-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
};
