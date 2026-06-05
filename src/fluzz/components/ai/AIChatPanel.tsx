import React, { useState, useRef, useEffect } from "react";
import { 
  Send, Loader2, Trash2, X, Check, Sparkles, Bot, User as UserIcon, 
  History, Plus, ChevronLeft, ExternalLink, MessageSquare,
  Paperclip, FileText
} from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import { Badge } from "@/fluzz/components/ui/badge";
import { Card } from "@/fluzz/components/ui/card";
import { useAIChat, Conversation } from "@/fluzz/hooks/useAIChat";
import { cn } from "@/fluzz/lib/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AIChatPanelProps {
  onClose?: () => void;
  showCloseButton?: boolean;
  className?: string;
}

// Parse content and create clickable links
function parseContent(text: string, onNavigate: (path: string) => void): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  
  lines.forEach((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    let currentIndex = 0;
    
    // Pattern for bold text and links
    const combinedRegex = /(\*\*(.*?)\*\*|\[TASK:([\w-]+)\]|\[PROJECT:([\w-]+)\]|\[POSITION:([\w-]+)\])/g;
    let match;
    
    while ((match = combinedRegex.exec(line)) !== null) {
      // Add text before the match
      if (match.index > currentIndex) {
        parts.push(line.substring(currentIndex, match.index));
      }
      
      if (match[2]) {
        // Bold text
        parts.push(
          <strong key={`bold-${lineIndex}-${match.index}`} className="font-semibold text-foreground">
            {match[2]}
          </strong>
        );
      } else if (match[3]) {
        // Task link
        parts.push(
          <button
            key={`task-${lineIndex}-${match.index}`}
            onClick={() => onNavigate(`/tools/wizzy-flow/tasks/${match[3]}`)}
            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="text-xs">Ver tarefa</span>
          </button>
        );
      } else if (match[4]) {
        // Project link
        parts.push(
          <button
            key={`project-${lineIndex}-${match.index}`}
            onClick={() => onNavigate(`/tools/wizzy-flow/projects/${match[4]}`)}
            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="text-xs">Ver projeto</span>
          </button>
        );
      } else if (match[5]) {
        // Position link
        parts.push(
          <button
            key={`position-${lineIndex}-${match.index}`}
            onClick={() => onNavigate(`/tools/wizzy-flow/positions/${match[5]}`)}
            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="text-xs">Ver cargo</span>
          </button>
        );
      }
      
      currentIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (currentIndex < line.length) {
      parts.push(line.substring(currentIndex));
    }
    
    // If no parts were added, use the original line
    if (parts.length === 0) {
      parts.push(line);
    }
    
    elements.push(
      <React.Fragment key={`line-${lineIndex}`}>
        {parts}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
  
  return elements;
}

// Conversation history sidebar
function ConversationHistory({ 
  conversations, 
  currentId,
  onSelect, 
  onDelete,
  onNew,
  onClose,
  isLoading 
}: {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-medium text-sm">Histórico</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="p-2">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2" 
          size="sm"
          onClick={onNew}
        >
          <Plus className="h-4 w-4" />
          Nova conversa
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma conversa salva
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                  currentId === conv.id 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-muted"
                )}
                onClick={() => onSelect(conv.id)}
              >
                <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(conv.updated_at), "dd/MM HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function AIChatPanel({ onClose, showCloseButton = false, className }: AIChatPanelProps) {
  const {
    messages,
    isLoading,
    pendingToolCalls,
    conversations,
    currentConversationId,
    isLoadingConversations,
    sendMessage,
    confirmToolCall,
    rejectToolCall,
    clearChat,
    loadConversation,
    deleteConversation,
    startNewConversation,
  } = useAIChat();

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [transcriptFile, setTranscriptFile] = useState<{ name: string; content: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingToolCalls]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !transcriptFile) || isLoading) return;

    const message = transcriptFile
      ? `${input.trim() || "Transforme esta transcrição de reunião em um projeto completo no Wizzy Flow."}\n\n[TRANSCRIÇÃO ANEXADA: ${transcriptFile.name}]\n${transcriptFile.content}\n[/TRANSCRIÇÃO ANEXADA]`
      : input.trim();

    sendMessage(message);
    setInput("");
    setTranscriptFile(null);
  };

  const handleTranscriptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const content = await file.text();
      setTranscriptFile({ name: file.name, content });
    } catch {
      setTranscriptFile(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const getToolCallLabel = (name: string) => {
    const labels: Record<string, string> = {
      extract_tasks_from_text: "Extrair tarefas",
      create_task: "Criar tarefa",
      create_project: "Criar projeto",
      create_project_with_tasks: "Criar projeto com tarefas",
      add_subtasks_to_task: "Adicionar subtarefas",
      create_briefing_for_project: "Criar briefing",
      update_task: "Atualizar tarefa",
      update_project: "Atualizar projeto",
      delete_task: "Excluir tarefa",
    };
    return labels[name] || name;
  };

  const quickActions = [
    { label: "Minhas tarefas atrasadas", prompt: "Quais são as minhas tarefas atrasadas?" },
    { label: "Tarefas em andamento", prompt: "Mostre as tarefas que estou fazendo agora" },
    { label: "Projetos ativos", prompt: "Liste todos os projetos ativos" },
    { label: "Membros da equipe", prompt: "Quem são os membros do workspace?" },
  ];

  return (
    <div className={cn("flex h-full bg-gradient-to-b from-background to-muted/10", className)}>
      {/* History sidebar */}
      {showHistory && (
        <div className="w-64 border-r shrink-0">
          <ConversationHistory
            conversations={conversations}
            currentId={currentConversationId}
            onSelect={(id) => {
              loadConversation(id);
              setShowHistory(false);
            }}
            onDelete={deleteConversation}
            onNew={() => {
              startNewConversation();
              setShowHistory(false);
            }}
            onClose={() => setShowHistory(false)}
            isLoading={isLoadingConversations}
          />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => setShowHistory(!showHistory)}
              title="Histórico de conversas"
            >
              <History className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shrink-0">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Flow AI</h2>
              <p className="text-xs text-muted-foreground">
                Seu assistente inteligente
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={startNewConversation}
                title="Nova conversa"
                className="h-8 w-8"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {showCloseButton && onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6 shadow-inner">
                  <Bot className="h-10 w-10 text-primary" />
                </div>
                <h3 className="font-semibold text-xl mb-2">Olá! Como posso ajudar?</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  Pergunte sobre tarefas, projetos ou membros. Você pode mencionar nomes parciais que eu encontro a pessoa certa!
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {quickActions.map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      className="rounded-full hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => {
                        setInput(action.prompt);
                        sendMessage(action.prompt);
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-sm mt-1">
                        <Sparkles className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card border rounded-bl-md"
                      )}
                    >
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {parseContent(message.content, handleNavigate)}
                      </div>
                    </div>
                    {message.role === "user" && (
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Pending Tool Calls (only for actions that need confirmation) */}
                {pendingToolCalls.map((tc) => (
                  <div key={tc.id} className="flex gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-sm mt-1">
                      <Sparkles className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <Card className="flex-1 p-4 border-primary/30 bg-primary/5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <Badge variant="secondary" className="mb-3 bg-primary/10 text-primary border-0">
                            {getToolCallLabel(tc.name)}
                          </Badge>
                          <div className="text-sm space-y-2">
                            {tc.name === "create_task" && (
                              <>
                                <p className="font-medium">{tc.arguments.title}</p>
                                {tc.arguments.description && (
                                  <p className="text-muted-foreground">{tc.arguments.description}</p>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  Prioridade: {tc.arguments.priority}
                                </Badge>
                              </>
                            )}
                            {tc.name === "create_project" && (
                              <>
                                <p className="font-medium">{tc.arguments.name}</p>
                                {tc.arguments.description && (
                                  <p className="text-muted-foreground">{tc.arguments.description}</p>
                                )}
                              </>
                            )}
                            {tc.name === "create_project_with_tasks" && (
                              <div className="space-y-2">
                                <p className="font-medium text-base">📁 {tc.arguments.name}</p>
                                {tc.arguments.description && (
                                  <p className="text-xs text-muted-foreground">{tc.arguments.description}</p>
                                )}
                                {(tc.arguments.start_date || tc.arguments.end_date) && (
                                  <p className="text-xs text-muted-foreground">
                                    📅 {tc.arguments.start_date || "—"} → {tc.arguments.end_date || "—"}
                                  </p>
                                )}
                                {tc.arguments.briefing && (
                                  <div className="rounded-lg border bg-background p-2 text-xs text-muted-foreground">
                                    <p className="font-medium text-foreground">📄 Briefing</p>
                                    {tc.arguments.briefing.data && <p>📅 {tc.arguments.briefing.data}</p>}
                                    {tc.arguments.briefing.local && <p>📍 {tc.arguments.briefing.local}</p>}
                                    {tc.arguments.briefing.participantes_pagantes != null && <p>👥 {tc.arguments.briefing.participantes_pagantes} participantes</p>}
                                    {tc.arguments.briefing.investimento != null && <p>💰 R$ {tc.arguments.briefing.investimento}</p>}
                                  </div>
                                )}
                                <div className="space-y-1.5 pt-1">
                                  <p className="text-xs font-semibold text-muted-foreground">
                                    {(tc.arguments.tasks || []).length} tarefa(s):
                                  </p>
                                  {(tc.arguments.tasks || []).map((task: any, idx: number) => (
                                    <div key={idx} className="p-2 bg-background rounded-lg border text-xs">
                                      <p className="font-medium">{idx + 1}. {task.title}</p>
                                      <div className="flex flex-wrap gap-2 mt-1 text-muted-foreground">
                                        {task.priority && <span>🎯 {task.priority}</span>}
                                        {task.assignee_name && <span>👤 {task.assignee_name}</span>}
                                        {task.due_date && <span>📅 {task.due_date}</span>}
                                      </div>
                                      {task.subtasks && task.subtasks.length > 0 && (
                                        <ul className="mt-1.5 ml-3 list-disc text-muted-foreground">
                                          {task.subtasks.map((s: any, si: number) => (
                                            <li key={si}>{typeof s === "string" ? s : s.title}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {tc.name === "add_subtasks_to_task" && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">
                                  {(tc.arguments.subtasks || []).length} subtarefa(s):
                                </p>
                                <ul className="ml-4 list-disc text-sm">
                                  {(tc.arguments.subtasks || []).map((s: string, i: number) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {tc.name === "create_briefing_for_project" && (
                              <div className="space-y-1 text-xs">
                                {tc.arguments.data && <p>📅 Data: {tc.arguments.data}</p>}
                                {tc.arguments.local && <p>📍 Local: {tc.arguments.local}</p>}
                                {tc.arguments.participantes_pagantes != null && (
                                  <p>👥 Participantes: {tc.arguments.participantes_pagantes}</p>
                                )}
                                {tc.arguments.investimento != null && (
                                  <p>💰 Investimento: R$ {tc.arguments.investimento}</p>
                                )}
                              </div>
                            )}
                            {tc.name === "update_task" && (
                              <div className="space-y-1 text-xs">
                                {tc.arguments.title && <p>Novo título: <strong>{tc.arguments.title}</strong></p>}
                                {tc.arguments.status && <p>Status: <strong>{tc.arguments.status}</strong></p>}
                                {tc.arguments.priority && <p>Prioridade: <strong>{tc.arguments.priority}</strong></p>}
                                {tc.arguments.due_date && <p>Prazo: <strong>{tc.arguments.due_date}</strong></p>}
                                {tc.arguments.assignee_name && <p>Responsável: <strong>{tc.arguments.assignee_name}</strong></p>}
                              </div>
                            )}
                            {tc.name === "update_project" && (
                              <div className="space-y-1 text-xs">
                                {tc.arguments.name && <p>Nome: <strong>{tc.arguments.name}</strong></p>}
                                {tc.arguments.status && <p>Status: <strong>{tc.arguments.status}</strong></p>}
                                {tc.arguments.start_date && <p>Início: {tc.arguments.start_date}</p>}
                                {tc.arguments.end_date && <p>Fim: {tc.arguments.end_date}</p>}
                              </div>
                            )}
                            {tc.name === "delete_task" && (
                              <p className="text-xs text-destructive">Esta ação removerá a tarefa permanentemente.</p>
                            )}
                            {tc.name === "extract_tasks_from_text" && tc.arguments.tasks && (
                              <div className="space-y-2">
                                {tc.arguments.tasks.map((task: any, idx: number) => (
                                  <div key={idx} className="p-2 bg-background rounded-lg border">
                                    <p className="font-medium">{task.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Prioridade: {task.priority}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectToolCall(tc.id)}
                            className="h-8 px-3"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => confirmToolCall(tc.id)}
                            className="h-8 px-3"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Confirmar
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-sm mt-1">
                      <Sparkles className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="bg-card border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-sm text-muted-foreground">Pensando...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t bg-card/50 backdrop-blur-sm shrink-0">
          {transcriptFile && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{transcriptFile.name}</span>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTranscriptFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="flex-1 relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.srt,.vtt,.csv,.json,.log"
                className="hidden"
                onChange={handleTranscriptUpload}
              />
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={transcriptFile ? "Opcional: diga o objetivo, restrições ou prazos importantes..." : "Digite sua mensagem..."}
                className="min-h-[52px] max-h-[200px] resize-none pl-12 pr-12 rounded-xl bg-background border-muted-foreground/20"
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-2 bottom-2 h-8 w-8 rounded-lg"
                title="Anexar transcrição"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && !transcriptFile) || isLoading}
                className="absolute right-2 bottom-2 h-8 w-8 rounded-lg"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
