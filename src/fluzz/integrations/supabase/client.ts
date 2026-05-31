import { supabase as wizzySupabase } from '@/integrations/supabase/client';

// Wizzy Flow roda dentro da Wizzy e deve usar a mesma sessao Supabase da plataforma.
export const supabase = wizzySupabase as any;
