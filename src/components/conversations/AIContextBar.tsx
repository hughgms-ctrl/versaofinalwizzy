import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConversationAnalysis } from '@/hooks/useConversationAnalysis';

interface AIContextBarProps {
  conversationId: string;
  isAIActive?: boolean;
}

export function AIContextBar({ conversationId }: AIContextBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { analyzeConversation, isAnalyzing, analysis, error, clearAnalysis } = useConversationAnalysis(conversationId);

  // Auto-analyze when conversation changes
  useEffect(() => {
    if (conversationId) {
      // Quick analysis without detailed media on initial load
      analyzeConversation(false);
    }
  }, [conversationId, analyzeConversation]);

  // Clear analysis when conversation changes
  useEffect(() => {
    clearAnalysis();
  }, [conversationId, clearAnalysis]);

  const handleRefresh = () => {
    // Full analysis with media understanding
    analyzeConversation(true);
  };

  const handleToggleExpand = () => {
    if (!isExpanded && !analysis?.fullSummary) {
      // Fetch full analysis with media when expanding
      analyzeConversation(true);
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="border-y border-border bg-accent/30 transition-all duration-300">
      {/* Brief Context Bar */}
      <div className="px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          
          {isAnalyzing && !analysis ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Analisando contexto da conversa...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span>Erro ao analisar</span>
            </div>
          ) : analysis ? (
          <span className="text-xs text-foreground line-clamp-1 max-w-full">
              <strong className="text-primary">Contexto:</strong>{' '}
              {analysis.briefContext.length > 80 
                ? `${analysis.briefContext.slice(0, 80)}...` 
                : analysis.briefContext}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              <strong>Contexto:</strong> Aguardando análise...
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRefresh}
            disabled={isAnalyzing}
            title="Atualizar análise"
          >
            <RefreshCw className={cn("h-3 w-3", isAnalyzing && "animate-spin")} />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={handleToggleExpand}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                <span className="hidden sm:inline">Recolher</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                <span className="hidden sm:inline">Ver resumo</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Summary */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
          {isAnalyzing ? (
            <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Analisando mensagens, áudios e imagens...</span>
            </div>
          ) : analysis?.fullSummary ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {analysis.fullSummary}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-4 gap-2 text-muted-foreground">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm">{error}</span>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-2">
              Clique em "Atualizar" para gerar o resumo completo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
