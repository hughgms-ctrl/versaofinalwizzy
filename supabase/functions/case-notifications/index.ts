import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendWhatsAppMessage } from '../_shared/whatsappProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Task {
  id: string;
  case_id: string;
  organization_id: string;
  title: string;
  due_date: string | null;
  assignee_id: string | null;
  completed_at: string | null;
  created_at: string;
  case?: { title: string };
  notif?: any;
}

async function sendWhatsAppNotification(
  supabase: any,
  organizationId: string,
  recipientPhone: string,
  message: string
) {
  try {
    const result = await sendWhatsAppMessage(supabase, {
      organizationId,
      phone: recipientPhone,
      type: 'text',
      text: message,
    });
    if (!result.ok) throw new Error(result.responseText || `Provider status ${result.status}`);
    return true;
  } catch (err) {
    console.error('Failed to send WhatsApp:', err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    let totalNotified = 0;

    // 1) Tarefas recém-criadas (notify_on_create) — últimas 5 minutos
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const { data: newTasks } = await supabase
      .from('case_tasks')
      .select(`
        id, case_id, organization_id, title, due_date, assignee_id, created_at,
        case:cases(title),
        notif:case_task_notifications(notify_on_create, notify_days_before, notify_on_overdue)
      `)
      .gte('created_at', fiveMinAgo.toISOString())
      .not('assignee_id', 'is', null);

    for (const t of (newTasks ?? []) as Task[]) {
      const notif = Array.isArray(t.notif) ? t.notif[0] : t.notif;
      if (!notif?.notify_on_create) continue;

      const { data: assignee } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('id', t.assignee_id)
        .maybeSingle();

      if (!assignee?.phone) continue;

      const dueText = t.due_date
        ? ` (vence ${new Date(t.due_date).toLocaleDateString('pt-BR')})`
        : '';
      const message = `🆕 *Nova tarefa atribuída*\n\n📋 ${t.title}\n📁 Caso: ${t.case?.title}${dueText}\n\nAcesse o painel para ver detalhes.`;

      const ok = await sendWhatsAppNotification(supabase, t.organization_id, assignee.phone, message);
      if (ok) totalNotified++;
    }

    // 2) Tarefas próximas do vencimento (notify_days_before)
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { data: dueTasks } = await supabase
      .from('case_tasks')
      .select(`
        id, case_id, organization_id, title, due_date, assignee_id,
        case:cases(title),
        notif:case_task_notifications(notify_on_create, notify_days_before, notify_on_overdue)
      `)
      .is('completed_at', null)
      .gte('due_date', now.toISOString())
      .lte('due_date', horizon.toISOString())
      .not('assignee_id', 'is', null);

    for (const t of (dueTasks ?? []) as Task[]) {
      const notif = Array.isArray(t.notif) ? t.notif[0] : t.notif;
      const daysBefore = notif?.notify_days_before ?? 1;

      const due = new Date(t.due_date!);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays !== daysBefore) continue;

      const { data: assignee } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('id', t.assignee_id)
        .maybeSingle();

      if (!assignee?.phone) continue;

      const message = `⏰ *Tarefa vence em ${diffDays} dia(s)*\n\n📋 ${t.title}\n📁 Caso: ${t.case?.title}\n📅 ${due.toLocaleDateString('pt-BR')}\n\nNão esqueça de concluir!`;

      const ok = await sendWhatsAppNotification(supabase, t.organization_id, assignee.phone, message);
      if (ok) totalNotified++;
    }

    // 3) Tarefas vencidas (notify_on_overdue) — venceram nas últimas 24h
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { data: overdueTasks } = await supabase
      .from('case_tasks')
      .select(`
        id, case_id, organization_id, title, due_date, assignee_id,
        case:cases(title),
        notif:case_task_notifications(notify_on_create, notify_days_before, notify_on_overdue)
      `)
      .is('completed_at', null)
      .gte('due_date', yesterday.toISOString())
      .lte('due_date', now.toISOString())
      .not('assignee_id', 'is', null);

    for (const t of (overdueTasks ?? []) as Task[]) {
      const notif = Array.isArray(t.notif) ? t.notif[0] : t.notif;
      if (!notif?.notify_on_overdue) continue;

      const { data: assignee } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('id', t.assignee_id)
        .maybeSingle();

      if (!assignee?.phone) continue;

      const message = `🚨 *Tarefa vencida*\n\n📋 ${t.title}\n📁 Caso: ${t.case?.title}\n📅 Venceu em ${new Date(t.due_date!).toLocaleDateString('pt-BR')}\n\nAtenção: precisa ser concluída urgentemente.`;

      const ok = await sendWhatsAppNotification(supabase, t.organization_id, assignee.phone, message);
      if (ok) totalNotified++;
    }

    // 4) Prazos do caso (case_deadlines) — mantém lógica antiga
    const { data: deadlines } = await supabase
      .from('case_deadlines')
      .select('id, case_id, organization_id, title, due_date, is_fatal, notify_days_before')
      .is('completed_at', null)
      .gte('due_date', now.toISOString())
      .lte('due_date', horizon.toISOString());

    for (const d of deadlines ?? []) {
      const due = new Date(d.due_date);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= (d.notify_days_before ?? 3)) {
        const { data: caseData } = await supabase
          .from('cases')
          .select('assignee_id, title')
          .eq('id', d.case_id)
          .maybeSingle();

        if (!caseData?.assignee_id) continue;

        await supabase.from('case_activity_log').insert({
          case_id: d.case_id,
          organization_id: d.organization_id,
          action: 'deadline_alert',
          payload: {
            deadline_id: d.id,
            title: d.title,
            due_date: d.due_date,
            days_remaining: diffDays,
            is_fatal: d.is_fatal,
          },
        });

        // Notifica também via WhatsApp se houver telefone
        const { data: assignee } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', caseData.assignee_id)
          .maybeSingle();

        if (assignee?.phone) {
          const fatalTag = d.is_fatal ? ' ⚠️ FATAL' : '';
          const message = `📅 *Prazo${fatalTag}*\n\n${d.title}\n📁 ${caseData.title}\n⏳ Faltam ${diffDays} dia(s)`;
          const ok = await sendWhatsAppNotification(supabase, d.organization_id, assignee.phone, message);
          if (ok) totalNotified++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, notified: totalNotified }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('case-notifications error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
