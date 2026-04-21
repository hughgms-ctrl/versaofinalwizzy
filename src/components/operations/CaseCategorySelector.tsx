import { ChevronDown, Layers, Scale, Building2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Category {
  id: string;
  name: string;
  kind: 'judicial' | 'administrative';
  color?: string | null;
}

interface Props {
  categories: Category[];
  selectedId: string; // 'all' | category id
  onSelect: (id: string) => void;
}

export function CaseCategorySelector({ categories, selectedId, onSelect }: Props) {
  const selected = categories.find((c) => c.id === selectedId);
  const judicial = categories.filter((c) => c.kind === 'judicial');
  const administrative = categories.filter((c) => c.kind === 'administrative');

  const Icon = !selected ? Layers : selected.kind === 'judicial' ? Scale : Building2;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[220px] justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected ? selected.name : 'Todos os tipos de caso'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px] bg-popover z-50 max-h-[420px] overflow-y-auto">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onSelect('all');
          }}
          className="gap-2"
        >
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className={selectedId === 'all' ? 'font-medium' : ''}>Todos os tipos</span>
        </DropdownMenuItem>

        {judicial.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Scale className="h-3 w-3" /> Judicial
            </DropdownMenuLabel>
            {judicial.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={(e) => {
                  e.preventDefault();
                  onSelect(c.id);
                }}
                className="gap-2"
              >
                <FolderOpen
                  className="h-4 w-4"
                  style={c.color ? { color: c.color } : { color: 'hsl(var(--primary))' }}
                />
                <span className={selectedId === c.id ? 'font-medium' : ''}>{c.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {administrative.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3 w-3" /> Administrativo
            </DropdownMenuLabel>
            {administrative.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={(e) => {
                  e.preventDefault();
                  onSelect(c.id);
                }}
                className="gap-2"
              >
                <FolderOpen
                  className="h-4 w-4"
                  style={c.color ? { color: c.color } : { color: 'hsl(217 91% 60%)' }}
                />
                <span className={selectedId === c.id ? 'font-medium' : ''}>{c.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {categories.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Nenhuma categoria criada
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
