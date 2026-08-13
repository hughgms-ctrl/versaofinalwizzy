import { Button } from '@/components/ui/button';
import { Check, Film, Images, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInstagramMedia } from '@/hooks/useInstagramMedia';
import type { InstagramMediaItem } from '@/hooks/useInstagramMedia';

/**
 * Grade de posts da conta, para escolher onde a automação vale.
 *
 * Substitui o campo onde se digitava o "ID do post" — um número de 17 dígitos
 * que não aparece em lugar nenhum do aplicativo do Instagram. Na prática o
 * escopo por post era inutilizável, e todas as regras acabavam valendo para
 * todos os posts.
 */

export type { InstagramMediaItem };

interface InstagramMediaPickerProps {
  accountId: string;
  /** IDs selecionados (controlado pelo formulário da regra). */
  value: string[];
  onChange: (mediaIds: string[]) => void;
  /** Quantas linhas mostrar antes de rolar. A tela guiada mostra menos. */
  compact?: boolean;
}

export function InstagramMediaPicker({ accountId, value, onChange, compact }: InstagramMediaPickerProps) {
  const { data: items = [], isLoading, error, refetch, isFetching } = useInstagramMedia(accountId);

  const toggle = (mediaId: string) => {
    onChange(
      value.includes(mediaId)
        ? value.filter((id) => id !== mediaId)
        : [...value, mediaId],
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-dashed py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando seus posts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">
          {(error as Error).message || 'Não foi possível carregar os posts'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Nenhum post encontrado nesta conta.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {value.length
            ? `${value.length} ${value.length === 1 ? 'post selecionado' : 'posts selecionados'}`
            : 'Toque nos posts em que a automação vale'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="h-7 px-2"
          aria-label="Recarregar posts"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </Button>
      </div>

      <div
        className={cn(
          'grid grid-cols-4 gap-1.5 overflow-y-auto rounded-md border p-1.5',
          compact ? 'max-h-40' : 'max-h-64',
        )}
      >
        {items.map((item) => {
          const selected = value.includes(item.id);
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => toggle(item.id)}
              aria-pressed={selected}
              title={item.caption || undefined}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-md border-2 bg-muted transition',
                selected ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30',
              )}
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.caption?.slice(0, 60) || 'Post do Instagram'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Images className="h-5 w-5" />
                </div>
              )}

              {/* Reel e carrossel têm comportamento de comentário idêntico, mas
                  saber qual é qual ajuda a reconhecer o post na grade. */}
              {(item.mediaType === 'VIDEO' || item.mediaType === 'CAROUSEL_ALBUM') && (
                <span className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white">
                  {item.mediaType === 'VIDEO'
                    ? <Film className="h-3 w-3" />
                    : <Images className="h-3 w-3" />}
                </span>
              )}

              {selected && (
                <span className="absolute inset-0 flex items-center justify-center bg-primary/30">
                  <span className="rounded-full bg-primary p-1 text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
