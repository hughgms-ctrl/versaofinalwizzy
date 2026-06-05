import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const VISITOR_KEY = 'wizzy_entry_visitor_id';
const ASSIGNMENT_KEY = 'wizzy_entry_assignment';
const SELECTED_PLAN_KEY = 'wizzy_entry_selected_plan';

export interface EntryFlowAssignment {
  experiment_id?: string | null;
  variant_id?: string | null;
  flow_type: string;
  redirect_path: string;
  variant_name?: string | null;
  config?: Record<string, any>;
  assigned_at?: string;
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

export function clearStoredEntryAssignment() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ASSIGNMENT_KEY);
}

export function getSelectedEntryPlan() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SELECTED_PLAN_KEY) || '';
}

export function setSelectedEntryPlan(planSlug?: string | null) {
  if (typeof window === 'undefined') return;
  const safeSlug = String(planSlug || '').trim();
  if (safeSlug) localStorage.setItem(SELECTED_PLAN_KEY, safeSlug);
  else localStorage.removeItem(SELECTED_PLAN_KEY);
}

export function clearSelectedEntryPlan() {
  setSelectedEntryPlan(null);
}

export function hasEntryLimitedAccessAssignment() {
  const assignment = getStoredEntryAssignment();
  return !!assignment && ['trial_auto', 'freemium', 'access_limited_payment'].includes(assignment.flow_type);
}

export function getEntryAccessConfig() {
  return getStoredEntryAssignment()?.config || {};
}

export function getEntryAccessLimit(key: string, fallback = 0) {
  const value = getEntryAccessConfig()[key];
  return typeof value === 'number' ? value : fallback;
}

export function canUseEntryAccessFeature(key: string, fallback = false) {
  const value = getEntryAccessConfig()[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function showEntryPlanRequiredToast(message: string) {
  toast(message, {
    description: 'Escolha um plano para continuar usando este recurso.',
    action: {
      label: 'Escolher plano',
      onClick: () => {
        window.location.href = '/plans';
      },
    },
  });
}

export function showEntryLimitReachedToast(resourceLabel: string) {
  showEntryPlanRequiredToast(`Limite de ${resourceLabel} atingido no teste gratis.`);
}

export function enforceEntryFeatureAccess(featureKey: string, resourceLabel: string, fallback = false) {
  if (!hasEntryLimitedAccessAssignment()) return true;
  if (canUseEntryAccessFeature(featureKey, fallback)) return true;
  showEntryPlanRequiredToast(`Para ${resourceLabel}, escolha um plano.`);
  return false;
}

export function enforceEntryCreationLimit(limitKey: string, currentCount: number, resourceLabel: string, fallback = Number.POSITIVE_INFINITY) {
  if (!hasEntryLimitedAccessAssignment()) return true;
  const limit = getEntryAccessLimit(limitKey, fallback);
  if (currentCount < limit) return true;
  showEntryLimitReachedToast(resourceLabel);
  return false;
}

export function isEntryTrialExpired() {
  const assignment = getStoredEntryAssignment();
  if (!assignment || !hasEntryLimitedAccessAssignment()) return false;
  if (assignment.config?.block_after_trial === false) return false;

  const trialDays = Number(assignment.config?.trial_days || 0);
  const assignedAt = assignment.assigned_at ? new Date(assignment.assigned_at).getTime() : 0;
  if (!trialDays || !assignedAt) return false;

  return Date.now() >= assignedAt + trialDays * 24 * 60 * 60 * 1000;
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
    flow_type: variant.flow_type || 'payment_first',
    redirect_path: variant.redirect_path || '/auth',
    variant_name: variant.name || null,
    config: variant.config || {},
    assigned_at: data?.assignment?.created_at || new Date().toISOString(),
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
  const intentFlowMap: Record<string, string> = {
    plans: 'payment_first',
    payment: 'payment_first',
    checkout: 'payment_first',
    trial: 'trial_auto',
    limited: 'trial_auto',
    freemium: 'trial_auto',
    onboarding: 'signup_onboarding_payment_access',
    approval: 'manual_approval',
  };
  const flowType = assignment?.flow_type || intentFlowMap[intent] || intent;
  const selectedPlan = getSelectedEntryPlan();
  const checkoutPath = selectedPlan
    ? `/plans?selected_plan=${encodeURIComponent(selectedPlan)}&auto_checkout=1`
    : '/plans';

  if (assignment?.flow_type === 'trial_auto' && assignment?.config?.require_card === true) return checkoutPath;
  if (['payment_first', 'trial_with_card'].includes(flowType)) return checkoutPath;
  if (['trial_auto', 'freemium', 'access_limited_payment'].includes(flowType)) return '/dashboard';
  if (['signup_onboarding_payment_access', 'onboarding_before_signup'].includes(flowType)) return '/subscription';
  if (flowType === 'manual_approval') return '/subscription';
  return '/dashboard';
}
