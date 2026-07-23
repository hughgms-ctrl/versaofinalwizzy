import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Trash2, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  useAgentKnowledgeFiles,
  useUploadAgentKnowledgeFile,
  useDeleteAgentKnowledgeFile,
} from '@/hooks/useAgentKnowledgeFiles';

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.xls,.txt';

// Base de conhecimento do agente -- upload de arquivos (PDF/DOCX/Excel/txt)
// que viram a base de busca (RAG) usada na hora de responder (ver conversa
// com o usuário: "não pode ficar burro"). Sem limite de tamanho por
// enquanto -- decisão explícita do usuário.
export function AgentKnowledgeSection({ agentId }: { agentId: string }) {
  const { data: files = [], isLoading } = useAgentKnowledgeFiles(agentId);
  const uploadFile = useUploadAgentKnowledgeFile();
  const deleteFile = useDeleteAgentKnowledgeFile();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach((file) => uploadFile.mutate({ agentId, file }));
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <Button
        type="button" variant="outline" size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploadFile.isPending}
      >
        {uploadFile.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
        Enviar arquivo (PDF, DOCX, Excel)
      </Button>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum arquivo ainda. O agente responde só com o prompt-base até você adicionar algo aqui.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs truncate">{file.file_name}</span>
                {file.status === 'processing' && (
                  <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> Processando
                  </Badge>
                )}
                {file.status === 'ready' && (
                  <Badge variant="outline" className="text-[10px] gap-1 shrink-0 text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Pronto
                  </Badge>
                )}
                {file.status === 'error' && (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 shrink-0 text-destructive border-destructive/40 bg-destructive/10"
                    title={file.error_message || 'Erro ao processar'}
                  >
                    <AlertTriangle className="h-2.5 w-2.5" /> Erro
                  </Badge>
                )}
              </div>
              <Button
                type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                onClick={() => deleteFile.mutate({ fileId: file.id, agentId, storagePath: file.storage_path })}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
