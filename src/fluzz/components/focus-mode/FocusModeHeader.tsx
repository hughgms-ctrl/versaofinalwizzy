import { useState } from "react";
import { Button } from "@/fluzz/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/fluzz/components/ui/popover";
import { Plus, Palette } from "lucide-react";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/fluzz/lib/utils";

interface FocusModeHeaderProps {
  selectedProject: { id: string; name: string; color?: string } | null;
  onCreateTask: () => void;
}

const projectColors = [
  { name: "primary", value: "hsl(var(--primary))" },
  { name: "blue", value: "hsl(217, 91%, 60%)" },
  { name: "emerald", value: "hsl(142, 71%, 45%)" },
  { name: "amber", value: "hsl(43, 96%, 56%)" },
  { name: "purple", value: "hsl(271, 81%, 56%)" },
  { name: "pink", value: "hsl(330, 81%, 60%)" },
  { name: "cyan", value: "hsl(188, 94%, 42%)" },
  { name: "rose", value: "hsl(346, 77%, 49%)" },
  { name: "orange", value: "hsl(25, 95%, 53%)" },
  { name: "teal", value: "hsl(173, 80%, 40%)" },
];

export function FocusModeHeader({ selectedProject, onCreateTask }: FocusModeHeaderProps) {
  const { isAdmin, isGestor } = useWorkspace();
  const queryClient = useQueryClient();
  const [colorOpen, setColorOpen] = useState(false);

  const handleColorChange = async (color: string) => {
    if (!selectedProject) return;
    
    try {
      const { error } = await supabase
        .from("projects")
        .update({ color })
        .eq("id", selectedProject.id);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["focus-projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project-for-focus"] });
      toast.success("Cor atualizada!");
      setColorOpen(false);
    } catch (error) {
      toast.error("Erro ao atualizar cor");
    }
  };

  const currentColor = selectedProject?.color 
    ? projectColors.find(c => c.name === selectedProject.color)?.value || projectColors[0].value
    : projectColors[0].value;

  const canEditColor = (isAdmin || isGestor) && selectedProject;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {selectedProject && (
          <span 
            className="h-3 w-3 rounded-full flex-shrink-0" 
            style={{ backgroundColor: currentColor }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground truncate">
              {selectedProject ? selectedProject.name : "Minhas Tarefas"}
            </h1>
            {canEditColor && (
              <Popover open={colorOpen} onOpenChange={setColorOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 flex-shrink-0"
                  >
                    <Palette className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  <div className="grid grid-cols-5 gap-1">
                    {projectColors.map((color) => (
                      <button
                        key={color.name}
                        className={cn(
                          "w-6 h-6 rounded-full border-2 transition-all hover:scale-110",
                          selectedProject?.color === color.name 
                            ? "border-foreground" 
                            : "border-transparent"
                        )}
                        style={{ backgroundColor: color.value }}
                        onClick={() => handleColorChange(color.name)}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {selectedProject 
              ? "Todas as tarefas do projeto"
              : "Foco total nas suas tarefas"
            }
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button onClick={onCreateTask} className="gap-2" size="sm">
          <Plus size={16} />
          <span className="hidden sm:inline">Nova Tarefa</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>
    </div>
  );
}
