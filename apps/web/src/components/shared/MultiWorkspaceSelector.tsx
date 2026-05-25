import { Check, MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Workspace } from '@/hooks/useWorkspaces';
import { cn } from '@/lib/utils';

interface MultiWorkspaceSelectorProps {
  workspaces: Workspace[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiWorkspaceSelector({
  workspaces,
  value,
  onChange,
  placeholder = 'Selecione os workspaces',
  className,
}: MultiWorkspaceSelectorProps) {
  const selected = workspaces.filter(w => value.includes(w.id));
  const allSelected = value.length === 0;

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-between bg-muted border-border h-11 rounded-lg font-normal',
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <MapPinned className="h-4 w-4 text-muted-foreground" />
            {allSelected ? (
              <span className="text-muted-foreground">Todos os workspaces</span>
            ) : selected.length === 1 ? (
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selected[0].color }}
                />
                {selected[0].name}
              </span>
            ) : (
              <span>{selected.length} workspaces selecionados</span>
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1 bg-card border-border" align="start">
        <button
          type="button"
          onClick={() => onChange([])}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-muted transition-colors"
        >
          <div className="w-4 flex justify-center">
            {allSelected && <Check className="h-3.5 w-3.5" />}
          </div>
          <span className="text-muted-foreground">Todos os workspaces</span>
        </button>
        <div className="h-px bg-border my-1" />
        {workspaces.map(ws => {
          const isSel = value.includes(ws.id);
          return (
            <button
              type="button"
              key={ws.id}
              onClick={() => toggle(ws.id)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-muted transition-colors"
            >
              <div className="w-4 flex justify-center">
                {isSel && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: ws.color }}
              />
              <span className="truncate">{ws.name}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
