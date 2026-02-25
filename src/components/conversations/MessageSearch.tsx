import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DbMessage } from '@/hooks/useConversations';

interface MessageSearchProps {
  messages: DbMessage[];
  onScrollToMessage: (messageId: string) => void;
  className?: string;
}

export function MessageSearch({ messages, onScrollToMessage, className }: MessageSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DbMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Search when query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setCurrentIndex(0);
      return;
    }

    const searchQuery = query.toLowerCase().trim();
    const matches = messages.filter(
      (msg) => msg.content?.toLowerCase().includes(searchQuery)
    );
    
    setResults(matches);
    setCurrentIndex(0);
    
    // Scroll to first result
    if (matches.length > 0) {
      onScrollToMessage(matches[0].id);
    }
  }, [query, messages, onScrollToMessage]);

  const goToNext = useCallback(() => {
    if (results.length === 0) return;
    const nextIndex = (currentIndex + 1) % results.length;
    setCurrentIndex(nextIndex);
    onScrollToMessage(results[nextIndex].id);
  }, [results, currentIndex, onScrollToMessage]);

  const goToPrevious = useCallback(() => {
    if (results.length === 0) return;
    const prevIndex = currentIndex === 0 ? results.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    onScrollToMessage(results[prevIndex].id);
  }, [results, currentIndex, onScrollToMessage]);

  const handleClose = () => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setCurrentIndex(0);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsOpen(true);
      }
      
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
      
      // Enter to go to next result
      if (e.key === 'Enter' && isOpen && results.length > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          goToPrevious();
        } else {
          goToNext();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, goToNext, goToPrevious]);

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        onClick={() => setIsOpen(true)}
        title="Buscar no histórico (Ctrl+F)"
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2 px-2 py-1.5 bg-card border rounded-lg shadow-sm",
      className
    )}>
      <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar nas mensagens..."
        className="h-7 border-0 bg-transparent focus-visible:ring-0 text-sm"
        autoFocus
      />
      
      {results.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge variant="secondary" className="text-xs px-1.5">
            {currentIndex + 1}/{results.length}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={goToPrevious}
            title="Anterior (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={goToNext}
            title="Próximo (Enter)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      
      {query && results.length === 0 && (
        <span className="text-xs text-muted-foreground flex-shrink-0">
          Nenhum resultado
        </span>
      )}
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0"
        onClick={handleClose}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
