import { useState } from 'react';
import { ChevronDown, Plus, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Pipeline } from '@/hooks/usePipelines';
import { CreatePipelineDialog } from './CreatePipelineDialog';
import { PipelineSettingsDialog } from './PipelineSettingsDialog';

interface PipelineSelectorProps {
  pipelines: Pipeline[];
  selectedPipeline: Pipeline | null;
  onSelect: (pipeline: Pipeline) => void;
  onDelete: (id: string) => void;
}

export function PipelineSelector({
  pipelines,
  selectedPipeline,
  onSelect,
  onDelete,
}: PipelineSelectorProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);

  const handleOpenSettings = (pipeline: Pipeline) => {
    setEditingPipeline(pipeline);
    setSettingsOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
            <span className="truncate">
              {selectedPipeline?.name || 'Selecionar Pipeline'}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px] bg-popover z-50">
          {pipelines.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum pipeline criado
            </div>
          ) : (
            pipelines.map((pipeline) => (
              <DropdownMenuItem
                key={pipeline.id}
                className="flex items-center justify-between group"
                onSelect={(e) => {
                  e.preventDefault();
                  onSelect(pipeline);
                }}
              >
                <span className={selectedPipeline?.id === pipeline.id ? 'font-medium' : ''}>
                  {pipeline.name}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSettings(pipeline);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(pipeline.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar novo pipeline
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreatePipelineDialog open={createOpen} onOpenChange={setCreateOpen} />
      
      {editingPipeline && (
        <PipelineSettingsDialog 
          open={settingsOpen} 
          onOpenChange={setSettingsOpen}
          pipeline={editingPipeline}
        />
      )}
    </>
  );
}
