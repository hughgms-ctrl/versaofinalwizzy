import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Deve espelhar MAX_ROWS da edge function import-contacts. */
const BATCH_SIZE = 200;

export interface ImportContactRow {
  phone: string;
  name?: string | null;
  email?: string | null;
  custom?: Record<string, string>;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ phone: string; error: string }>;
}

export interface ImportProgress {
  processed: number;
  total: number;
}

interface RunImportInput {
  rows: ImportContactRow[];
  workspaceId: string | null;
  tagIds?: string[];
  commonCustom?: Record<string, string>;
}

/**
 * Envia as linhas da planilha para a edge function `import-contacts` em lotes,
 * acumulando o resultado e reportando progresso.
 *
 * Não usa useMutation porque precisamos de progresso incremental durante uma
 * única operação lógica (vários POSTs sequenciais).
 */
export function useImportContacts() {
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({ processed: 0, total: 0 });

  const runImport = useCallback(
    async ({ rows, workspaceId, tagIds, commonCustom }: RunImportInput): Promise<ImportResult> => {
      setIsImporting(true);
      setProgress({ processed: 0, total: rows.length });

      const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

      try {
        for (let start = 0; start < rows.length; start += BATCH_SIZE) {
          const batch = rows.slice(start, start + BATCH_SIZE);

          const { data, error } = await supabase.functions.invoke('import-contacts', {
            body: { rows: batch, workspaceId, tagIds, commonCustom },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          total.created += data?.created || 0;
          total.updated += data?.updated || 0;
          total.skipped += data?.skipped || 0;
          if (Array.isArray(data?.errors)) {
            // Guarda só uma amostra: 10 mil linhas ruins não cabem na tela.
            total.errors.push(...data.errors.slice(0, Math.max(0, 20 - total.errors.length)));
          }

          setProgress({ processed: Math.min(start + batch.length, rows.length), total: rows.length });
        }

        // A lista de contatos e as conversas mostram nome/tags do contato.
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['contact-tags'] });

        return total;
      } finally {
        setIsImporting(false);
      }
    },
    [queryClient],
  );

  return { runImport, isImporting, progress };
}
