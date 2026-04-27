import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { startOfDay, subDays, format, startOfHour, subHours } from 'date-fns';

export interface DashboardMetrics {
  conversationsToday: number;
  resolvedToday: number;
  totalMessages: number;
  avgResponseTime: number;
  aiHandledPercentage: number;
  openConversations: number;
}

export interface ConversationsByHour {
  time: string;
  ai: number;
  human: number;
}

export interface ResolutionData {
  name: string;
  value: number;
  color: string;
}

export interface RecentConversation {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: Date;
  status: string;
  isFromBot: boolean;
  unreadCount: number;
}

// Helper: get conversation IDs filtered by workspace tags
async function getWorkspaceConversationIds(
  orgId: string,
  workspaceId: string | null,
  workspaces: any[]
): Promise<string[] | null> {
  if (!workspaceId) return null; // null means no filter

  const workspace = workspaces.find((w: any) => w.id === workspaceId);
  if (!workspace || !workspace.filter_tag_ids || workspace.filter_tag_ids.length === 0) {
    return null;
  }

  // Get contacts that have any of the workspace tags
  const { data: contactTags } = await supabase
    .from('contact_tags')
    .select('contact_id')
    .in('tag_id', workspace.filter_tag_ids);

  if (!contactTags || contactTags.length === 0) return [];

  const contactIds = [...new Set(contactTags.map((ct: any) => ct.contact_id))];

  // Get conversations for those contacts
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .eq('organization_id', orgId)
    .in('contact_id', contactIds);

  return conversations?.map((c: any) => c.id) || [];
}

export interface DateRange {
  sinceISO: string;
  untilISO: string;
}

export function useDashboardMetrics(range?: DateRange) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  const sinceISO = range?.sinceISO ?? startOfDay(new Date()).toISOString();
  const untilISO = range?.untilISO ?? null;
  const rangeKey = `${sinceISO}|${untilISO ?? 'now'}`;

  return useQuery({
    queryKey: ['dashboard-metrics', profile?.organization_id, selectedWorkspaceId, rangeKey],
    queryFn: async (): Promise<DashboardMetrics> => {
      if (!profile?.organization_id) {
        return {
          conversationsToday: 0,
          resolvedToday: 0,
          totalMessages: 0,
          avgResponseTime: 0,
          aiHandledPercentage: 0,
          openConversations: 0,
        };
      }

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      // If workspace filter returned empty, return zeros
      if (wsConvIds !== null && wsConvIds.length === 0) {
        return {
          conversationsToday: 0,
          resolvedToday: 0,
          totalMessages: 0,
          avgResponseTime: 0,
          aiHandledPercentage: 0,
          openConversations: 0,
        };
      }

      // Build base query helper
      const buildConvQuery = () => {
        let q = supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id);
        if (wsConvIds) q = q.in('id', wsConvIds);
        return q;
      };

      // Conversations in range
      let conversationsTodayQ = buildConvQuery().gte('created_at', sinceISO);
      if (untilISO) conversationsTodayQ = conversationsTodayQ.lte('created_at', untilISO);
      const { count: conversationsToday } = await conversationsTodayQ;

      // Resolved in range (closed + archived)
      let closedQ = buildConvQuery().eq('status', 'closed' as any).gte('closed_at', sinceISO);
      if (untilISO) closedQ = closedQ.lte('closed_at', untilISO);
      const { count: closedTodayCount } = await closedQ;

      let archivedQ = buildConvQuery().eq('status', 'archived').gte('updated_at', sinceISO);
      if (untilISO) archivedQ = archivedQ.lte('updated_at', untilISO);
      const { count: archivedTodayCount } = await archivedQ;
      const resolvedToday = (closedTodayCount || 0) + (archivedTodayCount || 0);

      // Open conversations (current snapshot — independente do período)
      const { count: openConversations } = await buildConvQuery().eq('status', 'open');

      // Get conversation IDs for message queries
      let convIdsForMessages: string[];
      if (wsConvIds) {
        convIdsForMessages = wsConvIds;
      } else {
        const { data: allConvs } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', profile.organization_id);
        convIdsForMessages = allConvs?.map(c => c.id) || [];
      }

      let totalMessages = 0;
      let aiMessages = 0;

      if (convIdsForMessages.length > 0) {
        let msgQ = (supabase as any)
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIdsForMessages)
          .gte('created_at', sinceISO);
        if (untilISO) msgQ = msgQ.lte('created_at', untilISO);
        const { count: msgCount } = await msgQ;
        totalMessages = msgCount || 0;

        let aiQ = (supabase as any)
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIdsForMessages)
          .eq('is_from_bot', true)
          .gte('created_at', sinceISO);
        if (untilISO) aiQ = aiQ.lte('created_at', untilISO);
        const { count: aiCount } = await aiQ;
        aiMessages = aiCount || 0;
      }

      const aiHandledPercentage = totalMessages > 0 
        ? Math.round((aiMessages / totalMessages) * 100) 
        : 0;

      return {
        conversationsToday: conversationsToday || 0,
        resolvedToday: resolvedToday || 0,
        totalMessages,
        avgResponseTime: 0,
        aiHandledPercentage,
        openConversations: openConversations || 0,
      };
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 30000,
  });
}

export function useConversationsByHour() {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  return useQuery({
    queryKey: ['conversations-by-hour', profile?.organization_id, selectedWorkspaceId],
    queryFn: async (): Promise<ConversationsByHour[]> => {
      if (!profile?.organization_id) return [];

      const now = new Date();
      const hours: ConversationsByHour[] = [];

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      let convIds: string[];
      if (wsConvIds !== null) {
        convIds = wsConvIds;
      } else {
        const { data: conversations } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', profile.organization_id);
        convIds = conversations?.map(c => c.id) || [];
      }

      if (convIds.length === 0) {
        for (let i = 23; i >= 0; i--) {
          const hour = subHours(now, i);
          hours.push({ time: format(hour, 'HH:00'), ai: 0, human: 0 });
        }
        return hours;
      }

      const dayAgo = subHours(now, 24).toISOString();
      const { data: messages } = await (supabase as any)
        .from('messages')
        .select('created_at, is_from_bot, direction')
        .in('conversation_id', convIds)
        .gte('created_at', dayAgo)
        .eq('direction', 'outbound');

      const hourlyData: Record<string, { ai: number; human: number }> = {};
      
      for (let i = 23; i >= 0; i--) {
        const hour = subHours(now, i);
        const key = format(hour, 'HH:00');
        hourlyData[key] = { ai: 0, human: 0 };
      }

      if (messages) {
        messages.forEach((msg: any) => {
          const hour = format(new Date(msg.created_at), 'HH:00');
          if (hourlyData[hour]) {
            if (msg.is_from_bot) {
              hourlyData[hour].ai++;
            } else {
              hourlyData[hour].human++;
            }
          }
        });
      }

      for (let i = 23; i >= 0; i--) {
        const hour = subHours(now, i);
        const key = format(hour, 'HH:00');
        hours.push({
          time: key,
          ai: hourlyData[key]?.ai || 0,
          human: hourlyData[key]?.human || 0,
        });
      }

      return hours;
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}

export function useResolutionData(range?: DateRange) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();
  const rangeKey = range ? `${range.sinceISO}|${range.untilISO}` : 'all';

  return useQuery({
    queryKey: ['resolution-data', profile?.organization_id, selectedWorkspaceId, rangeKey],
    queryFn: async (): Promise<ResolutionData[]> => {
      if (!profile?.organization_id) {
        return [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
      }

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      let query = supabase
        .from('conversations')
        .select('id, status, last_message_at')
        .eq('organization_id', profile.organization_id);

      if (range) {
        query = query.gte('created_at', range.sinceISO).lte('created_at', range.untilISO);
      }

      if (wsConvIds !== null) {
        if (wsConvIds.length === 0) {
          return [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
        }
        query = query.in('id', wsConvIds);
      }

      const { data: conversations } = await query;
      const total = conversations?.length || 0;

      if (!conversations || total === 0) {
        return [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
      }


      // Para calcular o status derivado precisamos saber a direção da última mensagem
      const convIds = conversations.map(c => c.id);
      const { data: lastMsgs } = await (supabase as any)
        .from('messages')
        .select('conversation_id, direction, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false });

      const lastDirByConv = new Map<string, 'inbound' | 'outbound'>();
      (lastMsgs || []).forEach((m: any) => {
        if (!lastDirByConv.has(m.conversation_id)) {
          lastDirByConv.set(m.conversation_id, m.direction);
        }
      });

      const counts = { aberto: 0, em_andamento: 0, encerrado: 0, archived: 0 };
      conversations.forEach((c: any) => {
        if (c.status === 'archived') {
          counts.archived++;
          return;
        }
        if (c.status === 'closed') {
          counts.encerrado++;
          return;
        }
        const dir = lastDirByConv.get(c.id);
        if (!dir) {
          counts.em_andamento++;
        } else if (dir === 'inbound') {
          counts.aberto++;
        } else {
          counts.em_andamento++;
        }
      });

      const result: ResolutionData[] = [];
      if (counts.aberto > 0) {
        result.push({ name: 'Aberto', value: Math.round((counts.aberto / total) * 100), color: 'hsl(0 84% 60%)' });
      }
      if (counts.em_andamento > 0) {
        result.push({ name: 'Em andamento', value: Math.round((counts.em_andamento / total) * 100), color: 'hsl(142 71% 45%)' });
      }
      if (counts.encerrado > 0) {
        result.push({ name: 'Encerrado', value: Math.round((counts.encerrado / total) * 100), color: 'hsl(217 91% 60%)' });
      }
      if (counts.archived > 0) {
        result.push({ name: 'Arquivado', value: Math.round((counts.archived / total) * 100), color: 'hsl(220 9% 46%)' });
      }

      return result.length > 0 ? result : [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}

export function useRecentConversations(limit = 5) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  return useQuery({
    queryKey: ['recent-conversations-dashboard', profile?.organization_id, selectedWorkspaceId, limit],
    queryFn: async (): Promise<RecentConversation[]> => {
      if (!profile?.organization_id) return [];

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      if (wsConvIds !== null && wsConvIds.length === 0) return [];

      let query = supabase
        .from('conversations')
        .select(`
          id,
          status,
          unread_count,
          last_message_at,
          contact:contacts(name, phone)
        `)
        .eq('organization_id', profile.organization_id)
        .order('last_message_at', { ascending: false })
        .limit(limit);

      if (wsConvIds) {
        query = query.in('id', wsConvIds);
      }

      const { data: conversations } = await query;

      if (!conversations) return [];

      const result: RecentConversation[] = [];
      
      for (const conv of conversations) {
        const { data: lastMsg } = await (supabase as any)
          .from('messages')
          .select('content, is_from_bot')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const contact = conv.contact as any;
        
        result.push({
          id: conv.id,
          contactName: contact?.name || contact?.phone || 'Contato',
          lastMessage: lastMsg?.content || 'Sem mensagens',
          lastMessageAt: new Date(conv.last_message_at || Date.now()),
          status: conv.status as any,
          isFromBot: lastMsg?.is_from_bot || false,
          unreadCount: conv.unread_count || 0,
        });
      }

      return result;
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 15000,
  });
}

export function useTeamPerformance(period: string = '7d') {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  return useQuery({
    queryKey: ['team-performance', profile?.organization_id, selectedWorkspaceId, period],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const daysMap: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[period] ?? 7;
      const since = days === 0
        ? startOfDay(new Date()).toISOString()
        : subDays(new Date(), days).toISOString();

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      if (wsConvIds !== null && wsConvIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url')
        .eq('organization_id', profile.organization_id);

      if (!profiles) return [];

      // Get conversations attended in period: intervened OR assigned and updated in period
      let convQuery = supabase
        .from('conversations')
        .select('id, intervened_by, assigned_to, intervened_at, updated_at')
        .eq('organization_id', profile.organization_id)
        .gte('updated_at', since);

      if (wsConvIds) convQuery = convQuery.in('id', wsConvIds);

      const { data: convs } = await convQuery;

      const counts: Record<string, Set<string>> = {};
      (convs || []).forEach((c: any) => {
        // Prefer intervened_by (who actually took over from AI/queue)
        const userId = c.intervened_by || c.assigned_to;
        if (!userId) return;
        // If using assigned_to, ensure intervention happened in period (use intervened_at when available)
        if (c.intervened_by && c.intervened_at && new Date(c.intervened_at) < new Date(since)) {
          // Intervention happened before period - skip
          return;
        }
        if (!counts[userId]) counts[userId] = new Set();
        counts[userId].add(c.id);
      });

      const result = profiles.map((member: any) => ({
        id: member.id,
        name: member.full_name,
        avatar_url: member.avatar_url,
        conversationsHandled: counts[member.user_id]?.size || 0,
        avgResponseTime: 0,
        satisfactionScore: 0,
      }));

      return result.filter(m => m.conversationsHandled > 0);
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}

// ============= REPORTS HOOKS =============

export interface ReportsMetrics {
  totalConversations: number;
  avgResponseTime: number;
  aiPercentage: number;
  totalMessages: number;
}

export interface ConversationsByDay {
  name: string;
  ia: number;
  humano: number;
  total: number;
}

export interface AgentPerformanceData {
  name: string;
  atendimentos: number;
  avatarUrl: string | null;
}

export function useReportsMetrics(period: string) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  return useQuery({
    queryKey: ['reports-metrics', profile?.organization_id, selectedWorkspaceId, period],
    queryFn: async (): Promise<ReportsMetrics> => {
      if (!profile?.organization_id) {
        return { totalConversations: 0, avgResponseTime: 0, aiPercentage: 0, totalMessages: 0 };
      }

      const daysMap: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[period] ?? 7;
      const since = days === 0
        ? startOfDay(new Date()).toISOString()
        : subDays(new Date(), days).toISOString();

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      if (wsConvIds !== null && wsConvIds.length === 0) {
        return { totalConversations: 0, avgResponseTime: 0, aiPercentage: 0, totalMessages: 0 };
      }

      let convQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact' })
        .eq('organization_id', profile.organization_id)
        .gte('created_at', since);
      if (wsConvIds) convQuery = convQuery.in('id', wsConvIds);

      const { data: convs, count: totalConversations } = await convQuery;
      const convIds = convs?.map(c => c.id) || [];

      let totalMessages = 0;
      let aiMessages = 0;

      if (convIds.length > 0) {
        const { count: msgCount } = await (supabase as any)
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .gte('created_at', since);
        totalMessages = msgCount || 0;

        const { count: aiCount } = await (supabase as any)
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .eq('is_from_bot', true)
          .gte('created_at', since);
        aiMessages = aiCount || 0;
      }

      return {
        totalConversations: totalConversations || 0,
        avgResponseTime: 0,
        aiPercentage: totalMessages > 0 ? Math.round((aiMessages / totalMessages) * 100) : 0,
        totalMessages,
      };
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}

export function useConversationsByDay(period: string) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  return useQuery({
    queryKey: ['conversations-by-day', profile?.organization_id, selectedWorkspaceId, period],
    queryFn: async (): Promise<ConversationsByDay[]> => {
      if (!profile?.organization_id) return [];

      const daysMap: Record<string, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[period] ?? 7;

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      // Get all conversations in period
      let convQuery = supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', profile.organization_id);
      if (wsConvIds !== null) {
        if (wsConvIds.length === 0) return [];
        convQuery = convQuery.in('id', wsConvIds);
      }

      const { data: convs } = await convQuery;
      const convIds = convs?.map(c => c.id) || [];
      if (convIds.length === 0) return [];

      const since = subDays(new Date(), days).toISOString();
      const { data: messages } = await (supabase as any)
        .from('messages')
        .select('created_at, is_from_bot, direction')
        .in('conversation_id', convIds)
        .gte('created_at', since)
        .eq('direction', 'outbound');

      // Group by day
      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const dailyData: Record<string, { ia: number; humano: number }> = {};

      for (let i = days - 1; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const key = format(d, 'dd/MM');
        dailyData[key] = { ia: 0, humano: 0 };
      }

      if (messages) {
        messages.forEach((msg: any) => {
          const key = format(new Date(msg.created_at), 'dd/MM');
          if (dailyData[key]) {
            if (msg.is_from_bot) dailyData[key].ia++;
            else dailyData[key].humano++;
          }
        });
      }

      return Object.entries(dailyData).map(([name, data]) => ({
        name,
        ia: data.ia,
        humano: data.humano,
        total: data.ia + data.humano,
      }));
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}

export function useReportsStatusDistribution(period: string) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  return useQuery({
    queryKey: ['reports-status-distribution', profile?.organization_id, selectedWorkspaceId, period],
    queryFn: async (): Promise<ResolutionData[]> => {
      if (!profile?.organization_id) {
        return [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
      }

      const daysMap: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[period] ?? 7;
      const since = days === 0
        ? startOfDay(new Date()).toISOString()
        : subDays(new Date(), days).toISOString();

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      let query = supabase
        .from('conversations')
        .select('status', { count: 'exact' })
        .eq('organization_id', profile.organization_id)
        .gte('created_at', since);

      if (wsConvIds !== null) {
        if (wsConvIds.length === 0) return [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
        query = query.in('id', wsConvIds);
      }

      const { data: conversations, count: total } = await query;

      if (!conversations || total === 0) {
        return [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
      }

      const statusCounts: Record<string, number> = { open: 0, resolved: 0, pending: 0 };
      conversations.forEach(c => {
        if (statusCounts[c.status] !== undefined) statusCounts[c.status]++;
      });

      const result: ResolutionData[] = [];
      if (statusCounts.resolved > 0) result.push({ name: 'Resolvido', value: Math.round((statusCounts.resolved / total!) * 100), color: 'hsl(142 71% 45%)' });
      if (statusCounts.open > 0) result.push({ name: 'Em Aberto', value: Math.round((statusCounts.open / total!) * 100), color: 'hsl(234 89% 54%)' });
      // Removed pending status

      return result.length > 0 ? result : [{ name: 'Sem dados', value: 100, color: 'hsl(220 9% 46%)' }];
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}

export function useReportsAgentPerformance(period: string) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  return useQuery({
    queryKey: ['reports-agent-performance', profile?.organization_id, selectedWorkspaceId, period],
    queryFn: async (): Promise<AgentPerformanceData[]> => {
      if (!profile?.organization_id) return [];

      const daysMap: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[period] ?? 7;
      const since = days === 0
        ? startOfDay(new Date()).toISOString()
        : subDays(new Date(), days).toISOString();

      const wsConvIds = await getWorkspaceConversationIds(
        profile.organization_id,
        selectedWorkspaceId,
        workspaces
      );

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url')
        .eq('organization_id', profile.organization_id);

      if (!allProfiles) return [];

      const result: AgentPerformanceData[] = [];

      for (const member of allProfiles) {
        let query = supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id)
          .eq('assigned_to', member.user_id)
          .gte('created_at', since);

        if (wsConvIds !== null) {
          if (wsConvIds.length === 0) continue;
          query = query.in('id', wsConvIds);
        }

        const { count } = await query;

        if ((count || 0) > 0) {
          result.push({
            name: member.full_name,
            atendimentos: count || 0,
            avatarUrl: member.avatar_url,
          });
        }
      }

      return result.sort((a, b) => b.atendimentos - a.atendimentos);
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}
