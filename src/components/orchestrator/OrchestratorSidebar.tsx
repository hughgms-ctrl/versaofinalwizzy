import { useState } from 'react';
import {
  Bot, Zap, GitBranch, Tag, Kanban, UserPlus, Clock, Building2, FileText,
  ChevronDown, ChevronRight, GripVertical, PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { orchestratorComponentCategories } from '@/data/orchestratorComponents';
import { OrchestratorComponent, OrchestratorNodeType } from '@/types/orchestrator';
import { Button } from '@/components/ui/button';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot, Zap, GitBranch, Tag, Kanban, UserPlus, Clock, Building2, FileText,
};

interface OrchestratorSidebarProps {
  onDragStart: (event: React.DragEvent, nodeType: OrchestratorNodeType, label: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function OrchestratorSidebar({ onDragStart, isCollapsed, onToggleCollapse }: OrchestratorSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['agents', 'actions', 'logic']);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleDragStart = (event: React.DragEvent, component: OrchestratorComponent) => {
    onDragStart(event, component.type, component.label);
  };

  if (isCollapsed) {
    return (
      <div className="w-12 bg-card border-r border-border h-full flex flex-col items-center py-3">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="mb-4">
          <PanelLeft className="h-4 w-4" />
        </Button>
        <div className="space-y-2">
          {orchestratorComponentCategories.map((category) => {
            const CategoryIcon = iconMap[category.icon] || Bot;
            return (
              <div key={category.id} className="h-8 w-8 rounded-md bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80" title={category.label}>
                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-card border-r border-border h-full overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground text-sm">Componentes</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Arraste para o canvas</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-2 space-y-1.5 flex-1 overflow-y-auto">
        {orchestratorComponentCategories.map((category) => {
          const CategoryIcon = iconMap[category.icon] || Bot;
          const isExpanded = expandedCategories.includes(category.id);

          return (
            <div key={category.id} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
              >
                <CategoryIcon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground flex-1 text-left">{category.label}</span>
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>

              {isExpanded && (
                <div className="p-1.5 space-y-1 bg-background">
                  {category.components.map((component) => {
                    const ComponentIcon = iconMap[component.icon] || Bot;
                    return (
                      <div
                        key={component.type}
                        draggable
                        onDragStart={(e) => handleDragStart(e, component)}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-card hover:border-primary/50 hover:shadow-sm cursor-grab active:cursor-grabbing transition-all"
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className={cn("h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0", component.color)}>
                          <ComponentIcon className="h-3 w-3 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{component.label}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{component.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
