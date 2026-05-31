import { useState, useCallback, useRef, useEffect } from "react";
import { streamChat, executeAction, Message, ToolCall } from "@/fluzz/lib/ai-chat";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";

// Funções que são consultas e devem ser executadas automaticamente
const QUERY_FUNCTIONS = [
  "query_overdue_tasks",
  "query_tasks_by_status",
  "query_user_tasks",
  "find_user_by_name",
  "list_projects",
  "list_sectors",
  "list_members",
  "query_briefings",
  "query_positions",
  "query_analytics",
];

// Funções que precisam de confirmação antes de executar
const ACTION_FUNCTIONS = [
  "create_task",
  "create_project",
  "create_project_with_tasks",
  "add_subtasks_to_task",
  "create_briefing_for_project",
  "update_task",
  "update_project",
  "delete_task",
  "extract_tasks_from_text",
];

const ACTION_ALIASES: Record<string, string> = {
  criar_projeto_com_tarefas: "create_project_with_tasks",
  criar_projeto_e_tarefas: "create_project_with_tasks",
  criar_projeto: "create_project",
  criar_tarefa: "create_task",
  criar_briefing: "create_briefing_for_project",
  adicionar_subtarefas: "add_subtasks_to_task",
  atualizar_tarefa: "update_task",
  atualizar_projeto: "update_project",
  excluir_tarefa: "delete_task",
};

const normalizeToolName = (name: string) => {
  const normalized = (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ACTION_ALIASES[normalized] || name;
};

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export function useAIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messageIdRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateId = () => {
    messageIdRef.current += 1;
    return `msg_${Date.now()}_${messageIdRef.current}`;
  };

  // Load conversations on mount
  useEffect(() => {
    if (workspace?.id && user?.id) {
      loadConversations();
    }
  }, [workspace?.id, user?.id]);

  // Auto-save messages when they change
  useEffect(() => {
    if (messages.length > 0 && workspace?.id && user?.id) {
      // Debounce save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveCurrentConversation();
      }, 1000);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages]);

  const loadConversations = async () => {
    if (!workspace?.id || !user?.id) return;
    
    setIsLoadingConversations(true);
    try {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .eq("workspace_id", workspace.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const saveCurrentConversation = async () => {
    if (!workspace?.id || !user?.id || messages.length === 0) return;

    try {
      // Generate title from first user message
      const firstUserMessage = messages.find(m => m.role === "user");
      const title = firstUserMessage?.content.slice(0, 50) || "Nova conversa";

      const messagesData = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      }));

      if (currentConversationId) {
        // Update existing conversation
        await supabase
          .from("ai_conversations")
          .update({
            messages: messagesData,
            title: title + (title.length >= 50 ? "..." : ""),
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentConversationId);
      } else {
        // Create new conversation
        const { data, error } = await supabase
          .from("ai_conversations")
          .insert({
            user_id: user.id,
            workspace_id: workspace.id,
            title: title + (title.length >= 50 ? "..." : ""),
            messages: messagesData,
          })
          .select("id")
          .single();

        if (!error && data) {
          setCurrentConversationId(data.id);
          loadConversations(); // Refresh list
        }
      }
    } catch (error) {
      console.error("Error saving conversation:", error);
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("messages")
        .eq("id", conversationId)
        .single();

      if (error) throw error;

      const loadedMessages = (data.messages as any[]).map((m: any) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));

      setMessages(loadedMessages);
      setCurrentConversationId(conversationId);
      setPendingToolCalls([]);
    } catch (error) {
      console.error("Error loading conversation:", error);
      toast.error("Erro ao carregar conversa");
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await supabase
        .from("ai_conversations")
        .delete()
        .eq("id", conversationId);

      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      if (currentConversationId === conversationId) {
        clearChat();
      }
      
      toast.success("Conversa excluída");
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Erro ao excluir conversa");
    }
  };

  const formatQueryResult = (functionName: string, result: any): string => {
    if (!result.success) {
      return `❌ ${result.error}`;
    }

    switch (functionName) {
      case "find_user_by_name": {
        const foundUser = result.user;
        return `👤 Encontrei: **${foundUser.full_name}**`;
      }

      case "query_user_tasks": {
        const tasks = result.tasks || [];
        const userName = result.user_name;
        if (tasks.length === 0) {
          return `✨ **${userName}** não tem tarefas no momento.`;
        }
        let response = `📋 **Tarefas de ${userName}** (${tasks.length}):\n\n`;
        tasks.forEach((task: any, idx: number) => {
          const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
          const status = task.status === 'feita' ? '✅' : task.status === 'fazendo' ? '🔄' : '📌';
          const projectName = task.project?.name || 'Sem projeto';
          const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : '';
          response += `${idx + 1}. ${status} **${task.title}**\n`;
          response += `   ${priority} ${projectName}${dueDate ? ` • 📅 ${dueDate}` : ''} [TASK:${task.id}]\n\n`;
        });
        return response;
      }

      case "query_overdue_tasks": {
        const tasks = result.tasks || [];
        const userName = result.user_name;
        
        if (tasks.length === 0) {
          if (userName) {
            return `✨ Ótima notícia! **${userName}** não tem tarefas atrasadas.`;
          }
          return "✨ **Ótima notícia!** Não há tarefas atrasadas no momento.";
        }
        
        let response = userName 
          ? `📋 **Tarefas atrasadas de ${userName}** (${tasks.length}):\n\n`
          : `⚠️ **${tasks.length} tarefa${tasks.length > 1 ? 's' : ''} atrasada${tasks.length > 1 ? 's' : ''}:**\n\n`;
        
        tasks.forEach((task: any, idx: number) => {
          const priority = task.priority === 'high' ? '🔴 Alta' : task.priority === 'medium' ? '🟡 Média' : '🟢 Baixa';
          const projectName = task.project?.name || 'Sem projeto';
          const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : 'Sem data';
          const assignee = task.assigned_to_name || '';
          
          response += `${idx + 1}. **${task.title}**\n`;
          response += `   📁 ${projectName} • ${priority}\n`;
          response += `   📅 Venceu em: ${dueDate}${assignee ? ` • 👤 ${assignee}` : ''} [TASK:${task.id}]\n\n`;
        });
        return response;
      }

      case "query_tasks_by_status": {
        const tasks = result.tasks || [];
        if (tasks.length === 0) {
          return "📭 Nenhuma tarefa encontrada com esse status.";
        }
        let response = `📋 **${tasks.length} tarefa${tasks.length > 1 ? 's' : ''} encontrada${tasks.length > 1 ? 's' : ''}:**\n\n`;
        tasks.forEach((task: any, idx: number) => {
          const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
          const projectName = task.project?.name || 'Sem projeto';
          const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : '';
          response += `${idx + 1}. ${priority} **${task.title}**\n`;
          response += `   📁 ${projectName}${dueDate ? ` • 📅 ${dueDate}` : ''} [TASK:${task.id}]\n\n`;
        });
        return response;
      }

      case "list_projects": {
        const projects = result.projects || [];
        if (projects.length === 0) {
          return "📭 Nenhum projeto ativo encontrado.";
        }
        let response = `📁 **${projects.length} projeto${projects.length > 1 ? 's' : ''} ativo${projects.length > 1 ? 's' : ''}:**\n\n`;
        projects.forEach((project: any, idx: number) => {
          const statusEmoji = project.status === 'active' ? '🟢' : project.status === 'completed' ? '✅' : '⏸️';
          response += `${idx + 1}. ${statusEmoji} **${project.name}** [PROJECT:${project.id}]\n`;
        });
        return response;
      }

      case "list_sectors": {
        const sectors = result.sectors || [];
        if (sectors.length === 0) {
          return "📭 Nenhum setor cadastrado.";
        }
        let response = `🏢 **${sectors.length} setor${sectors.length > 1 ? 'es' : ''}:**\n\n`;
        sectors.forEach((sector: any, idx: number) => {
          response += `${idx + 1}. **${sector.name}**\n`;
        });
        return response;
      }

      case "list_members": {
        const members = result.members || [];
        if (members.length === 0) {
          return "📭 Nenhum membro encontrado.";
        }
        let response = `👥 **${members.length} membro${members.length > 1 ? 's' : ''} no workspace:**\n\n`;
        members.forEach((member: any, idx: number) => {
          const roleEmoji = member.role === 'admin' ? '👑' : member.role === 'gestor' ? '📊' : '👤';
          const roleName = member.role === 'admin' ? 'Admin' : member.role === 'gestor' ? 'Gestor' : 'Membro';
          response += `${idx + 1}. ${roleEmoji} **${member.name}** (${roleName})\n`;
        });
        return response;
      }

      case "query_briefings": {
        const briefings = result.briefings || [];
        if (briefings.length === 0) {
          return "📭 Nenhum briefing encontrado.";
        }
        let response = `📄 **${briefings.length} briefing${briefings.length > 1 ? 's' : ''}:**\n\n`;
        briefings.forEach((briefing: any, idx: number) => {
          const date = new Date(briefing.data).toLocaleDateString('pt-BR');
          const projectName = briefing.project?.name || 'Sem projeto';
          response += `${idx + 1}. **${projectName}** - 📅 ${date}\n`;
          response += `   📍 ${briefing.local} • 👥 ${briefing.participantes_pagantes} participantes\n\n`;
        });
        return response;
      }

      case "query_positions": {
        const positions = result.positions || [];
        if (positions.length === 0) {
          return "📭 Nenhum cargo cadastrado.";
        }
        let response = `👔 **${positions.length} cargo${positions.length > 1 ? 's' : ''}:**\n\n`;
        positions.forEach((position: any, idx: number) => {
          response += `${idx + 1}. **${position.name}**\n`;
          if (position.description) {
            response += `   ${position.description}\n`;
          }
          response += `   [POSITION:${position.id}]\n\n`;
        });
        return response;
      }

      case "query_analytics": {
        const stats = result.analytics;
        if (!stats) {
          return "📊 Sem dados analíticos disponíveis.";
        }
        return `📊 **Resumo de Tarefas:**\n\n` +
          `• **Total:** ${stats.total} tarefas\n` +
          `• ✅ **Concluídas:** ${stats.completed}\n` +
          `• 🔄 **Em andamento:** ${stats.in_progress}\n` +
          `• 📌 **A fazer:** ${stats.todo}\n` +
          `• 🔴 **Alta prioridade:** ${stats.high_priority}`;
      }

      default:
        return JSON.stringify(result, null, 2);
    }
  };

  const sendMessage = useCallback(async (content: string) => {
    if (!workspace?.id) {
      toast.error("Nenhum workspace selecionado");
      return;
    }

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const chatHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    chatHistory.push({ role: "user", content });

    let assistantContent = "";

    const updateAssistant = (newContent: string) => {
      assistantContent += newContent;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [
          ...prev,
          {
            id: generateId(),
            role: "assistant",
            content: assistantContent,
            timestamp: new Date(),
          },
        ];
      });
    };

    const handleToolCall = async (toolCall: ToolCall) => {
      const normalizedToolCall = { ...toolCall, name: normalizeToolName(toolCall.name) };
      // Se for uma consulta, executa automaticamente
      if (QUERY_FUNCTIONS.includes(normalizedToolCall.name)) {
        const result = await executeAction(
          normalizedToolCall.name,
          normalizedToolCall.arguments,
          workspace.id
        );

        const formattedResult = formatQueryResult(normalizedToolCall.name, result.data || result);
        
        // Adiciona o resultado formatado como mensagem do assistente
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content === assistantContent) {
            const newContent = assistantContent + (assistantContent ? "\n\n" : "") + formattedResult;
            assistantContent = newContent;
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: newContent } : m
            );
          }
          return [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: formattedResult,
              timestamp: new Date(),
            },
          ];
        });
      } else {
        if (!ACTION_FUNCTIONS.includes(normalizedToolCall.name)) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: "Não consegui montar uma ação válida. Pode reformular o pedido com o nome do projeto, tarefas e prazos?",
              timestamp: new Date(),
            },
          ]);
          return;
        }
        // Para ações que precisam confirmação, adiciona à lista de pendentes
        setPendingToolCalls((prev) => [...prev, normalizedToolCall]);
      }
    };

    await streamChat(
      chatHistory,
      workspace.id,
      (delta) => updateAssistant(delta),
      handleToolCall,
      () => {
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        toast.error(error);
      }
    );
  }, [messages, workspace]);

  const confirmToolCall = useCallback(async (toolCallId: string) => {
    if (!workspace?.id) return;

    const toolCall = pendingToolCalls.find((tc) => tc.id === toolCallId);
    if (!toolCall) return;

    setPendingToolCalls((prev) =>
      prev.map((tc) =>
        tc.id === toolCallId ? { ...tc, status: "executed" } : tc
      )
    );

    const result = await executeAction(
      toolCall.name,
      toolCall.arguments,
      workspace.id
    );

    // Edge function pode retornar HTTP 200 com {success:false, error}
    const innerSuccess = result.success && (result.data?.success !== false);
    const innerMessage = result.data?.message;
    const innerError = result.data?.error || result.error;

    if (innerSuccess) {
      toast.success(innerMessage || "Ação executada com sucesso!");
      
      // Invalidate relevant queries
      if (toolCall.name === "create_task" || toolCall.name === "update_task" || toolCall.name === "delete_task" || toolCall.name === "add_subtasks_to_task") {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
        queryClient.invalidateQueries({ queryKey: ["subtasks"] });
      } else if (toolCall.name === "create_project" || toolCall.name === "update_project" || toolCall.name === "create_project_with_tasks") {
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        queryClient.invalidateQueries({ queryKey: ["focus-projects"] });
      } else if (toolCall.name === "create_briefing_for_project") {
        queryClient.invalidateQueries({ queryKey: ["briefings"] });
      }

      // Add result to conversation
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: `✅ ${innerMessage || "Ação executada com sucesso!"}`,
          timestamp: new Date(),
        },
      ]);
    } else {
      const errMsg = innerError || "Erro ao executar ação";
      toast.error(errMsg);
      
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: `❌ ${errMsg}`,
          timestamp: new Date(),
        },
      ]);
    }

    setPendingToolCalls((prev) => prev.filter((tc) => tc.id !== toolCallId));
  }, [pendingToolCalls, workspace, queryClient]);

  const rejectToolCall = useCallback((toolCallId: string) => {
    setPendingToolCalls((prev) =>
      prev.filter((tc) => tc.id !== toolCallId)
    );
    
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: "assistant",
        content: "Entendido. A ação foi cancelada.",
        timestamp: new Date(),
      },
    ]);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setPendingToolCalls([]);
    setCurrentConversationId(null);
  }, []);

  const startNewConversation = useCallback(() => {
    clearChat();
  }, [clearChat]);

  return {
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
    refreshConversations: loadConversations,
  };
}
