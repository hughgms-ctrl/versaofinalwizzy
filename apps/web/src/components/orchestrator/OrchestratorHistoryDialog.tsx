import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Clock, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface VersionSnapshot {
  timestamp: string;
  nodes: any[];
  edges: any[];
  promptContent: string;
  label?: string;
}

interface OrchestratorHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: VersionSnapshot[];
  onRestore: (version: VersionSnapshot) => void;
}

export function OrchestratorHistoryDialog({
  open,
  onOpenChange,
  history,
  onRestore,
}: OrchestratorHistoryDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleRestore = (version: VersionSnapshot) => {
    onRestore(version);
    onOpenChange(false);
    setSelectedIndex(null);
  };

  const sorted = [...history].reverse(); // newest first

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Histórico de Versões
          </DialogTitle>
        </DialogHeader>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma versão salva ainda. O histórico será criado a cada salvamento.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {sorted.map((version, index) => {
                const nodeCount = version.nodes?.length || 0;
                const edgeCount = version.edges?.length || 0;
                const isSelected = selectedIndex === index;
                const date = new Date(version.timestamp);

                return (
                  <div
                    key={version.timestamp}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedIndex(isSelected ? null : index)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <span className="text-sm font-medium">
                          {format(date, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                        </span>
                        {index === 0 && (
                          <Badge variant="secondary" className="text-[10px]">Mais recente</Badge>
                        )}
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                    </div>

                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{nodeCount} nós</span>
                      <span className="text-xs text-muted-foreground">{edgeCount} conexões</span>
                      {version.promptContent && (
                        <span className="text-xs text-muted-foreground">
                          {version.promptContent.length} chars no prompt
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-border">
                        {version.promptContent && (
                          <p className="text-xs text-muted-foreground line-clamp-3 mb-3 font-mono bg-muted/50 p-2 rounded">
                            {version.promptContent.substring(0, 200)}
                            {version.promptContent.length > 200 ? '...' : ''}
                          </p>
                        )}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(version);
                          }}
                          className="w-full gap-2"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restaurar esta versão
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
