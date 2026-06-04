import { supabase } from '@/integrations/supabase/client';

const VISITOR_KEY = 'wizzy_entry_visitor_id';
const ASSIGNMENT_KEY = 'wizzy_entry_assignment';

export interface EntryFlowAssignment {
  experiment_id?: string | null;
  variant_id?: string | null;
  flow_type: string;
  redirect_path: string;
  variant_name?: string | null;
}

function createVisitorId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getEntryVisitorId() {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const next = createVisitorId();
  localStorage.setItem(VISITOR_KEY, next);
  return next;
}

export function getStoredEntryAssignment(): EntryFlowAssignment | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ASSIGNMENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeEntryAssignment(assignment: EntryFlowAssignment) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ASSIGNMENT_KEY, JSON.stringify(assignment));
}

export async function assignEntryFlow(path = window.location.pathname): Promise<EntryFlowAssignment> {
  const visitorId = getEntryVisitorId();
  const { data, error } = await supabase.functions.invoke('entry-flow', {
    body: {
      action: 'assign',
      visitor_id: visitorId,
      path,
    },
  });

  if (error) throw error;

  const variant = data?.variant || {};
  const assignment: EntryFlowAssignment = {
    experiment_id: data?.experiment?.id || data?.assignment?.experiment_id || null,
    variant_id: variant.id || data?.assignment?.variant_id || null,
    flow_type: variant.flow_type || 'signup_first_payment_after',
    redirect_path: variant.redirect_path || '/auth',
    variant_name: variant.name || null,
  };
  storeEntryAssignment(assignment);
  return assignment;
}

export async function trackEntryEvent(eventName: string, metadata: Record<string, any> = {}) {
  const visitorId = getEntryVisitorId();
  const assignment = getStoredEntryAssignment();
  const { data: session } = await supabase.auth.getSession();

  await supabase.functions.invoke('entry-flow', {
    body: {
      action: 'event',
      visitor_id: visitorId,
      experiment_id: assignment?.experiment_id || null,
      variant_id: assignment?.variant_id || null,
      event_name: eventName,
      metadata: {
        ...metadata,
        flow_type: assignment?.flow_type || null,
        variant_name: assignment?.variant_name || null,
      },
    },
    headers: session.session?.access_token
      ? { Authorization: `Bearer ${session.session.access_token}` }
      : undefined,
  });
}

export function routeAfterSignup() {
  const assignment = getStoredEntryAssignment();
  const intent = new URLSearchParams(window.location.search).get('intent') || '';
  const flowType = assignment?.flow_type || intent;

  if (['payment_first', 'trial_with_card'].includes(flowType)) return '/plans';
  if (['trial_auto', 'freemium', 'access_limited_payment'].includes(flowType)) return '/dashboard';
  if (['signup_onboarding_payment_access', 'onboarding_before_signup'].includes(flowType)) return '/subscription';
  if (flowType === 'manual_approval') return '/subscription';
  return '/dashboard';
}
