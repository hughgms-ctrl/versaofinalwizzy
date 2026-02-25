import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MediaAnalysis {
  messageId: string;
  type: string;
  description: string;
}

interface AnalysisResult {
  briefContext: string;
  fullSummary: string;
  mediaAnalysis: MediaAnalysis[];
}

export function useConversationAnalysis(conversationId: string | null) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeConversation = useCallback(async (analyzeMedia: boolean = true) => {
    if (!conversationId) return null;

    setIsAnalyzing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-conversation', {
        body: { conversationId, analyzeMedia },
      });

      if (fnError) {
        throw fnError;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setAnalysis(data);
      return data as AnalysisResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao analisar conversa';
      setError(message);
      console.error('Analysis error:', err);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [conversationId]);

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    analyzeConversation,
    clearAnalysis,
    isAnalyzing,
    analysis,
    error,
  };
}
