import { useMemo, useState } from 'react';
import { CheckCircle, Plus, Search } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

export interface TagPickerOption {
  id: string;
  name: string;
  color?: string | null;
}

interface TagPickerSubContentProps {
  tags: TagPickerOption[] | undefined;
  /** Ids das tags ja aplicadas ao contato. */
  selectedTagIds: Set<string>;
  onToggle: (tagId: string) => void;
  /** Quando informado, mostra o atalho "Criar nova tag" no rodape. */
  onCreate?: () => void;
  /** Mensagem no lugar da lista (ex: contato indisponivel). */
  emptyMessage?: string;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Lista de tags do submenu. Orgs com dezenas de tags estouravam a altura da
 * tela e as tags de baixo ficavam inalcancaveis: aqui a lista rola dentro do
 * submenu, tem busca e o menu nao fecha a cada tag marcada.
 */
export function TagPickerSubContent({
  tags,
  selectedTagIds,
  onToggle,
  onCreate,
  emptyMessage,
}: TagPickerSubContentProps) {
  const [search, setSearch] = useState('');

  const filteredTags = useMemo(() => {
    if (!tags) return [];
    const term = normalize(search.trim());
    if (!term) return tags;
    return tags.filter(tag => normalize(tag.name).includes(term));
  }, [tags, search]);

  const selectedCount = useMemo(
    () => (tags || []).filter(tag => selectedTagIds.has(tag.id)).length,
    [tags, selectedTagIds]
  );

  return (
    <DropdownMenuSubContent
      className="flex w-64 max-h-[min(70vh,24rem)] flex-col p-0"
      onClick={(e) => e.stopPropagation()}
    >
      {emptyMessage ? (
        <div className="p-1">
          <DropdownMenuItem disabled>{emptyMessage}</DropdownMenuItem>
        </div>
      ) : !tags || tags.length === 0 ? (
        <div className="p-1">
          <DropdownMenuItem disabled>Nenhuma tag criada</DropdownMenuItem>
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tag..."
                className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                // O menu do Radix captura teclas (typeahead) e engoliria o que
                // o usuario digita; setas e Escape continuam chegando no menu.
                onKeyDown={(e) => {
                  if (!['Escape', 'Tab', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
                    e.stopPropagation();
                  }
                }}
              />
            </div>
            {selectedCount > 0 && (
              <div className="px-1 pt-1.5 text-[11px] text-muted-foreground">
                {selectedCount} {selectedCount === 1 ? 'tag aplicada' : 'tags aplicadas'}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {filteredTags.length === 0 ? (
              <DropdownMenuItem disabled>Nenhuma tag encontrada</DropdownMenuItem>
            ) : (
              filteredTags.map(tag => {
                const isTagged = selectedTagIds.has(tag.id);
                return (
                  <DropdownMenuItem
                    key={tag.id}
                    // Mantem o submenu aberto para marcar varias tags de uma vez.
                    onSelect={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(tag.id);
                    }}
                  >
                    <div
                      className="h-3 w-3 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: tag.color || '#888' }}
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {isTagged && <CheckCircle className="h-3 w-3 text-primary ml-2 shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </div>

          {onCreate && (
            <div className="shrink-0 border-t p-1">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onCreate();
                }}
              >
                <Plus className="h-4 w-4 mr-2 text-emerald-500" />
                Criar nova tag
              </DropdownMenuItem>
            </div>
          )}
        </>
      )}
    </DropdownMenuSubContent>
  );
}
