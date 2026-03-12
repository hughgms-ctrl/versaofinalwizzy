-- Update governance prompts to 'implemented' status
UPDATE governance_prompts SET status = 'implemented', content = 'Ofuscação para evitar vazamento das chaves Supabase. Mitigação: nunca expor service role key, usar apenas anon key no client. CSP implementado via meta tag no index.html bloqueando frames, objects e restringindo origens de scripts/conexões.', updated_at = now() WHERE id = '19600bae-dd6c-43cf-8270-8822ed4d4eaf';

UPDATE governance_prompts SET status = 'implemented', content = 'Sanitização de conteúdo HTML com utilitário src/lib/sanitize.ts. WhatsApp formatter escapa HTML antes de formatar. CSP meta tag bloqueia scripts inline maliciosos e frames externos. Nenhum uso de dangerouslySetInnerHTML com input não-sanitizado.', updated_at = now() WHERE id = 'e1037371-3e24-46cd-95eb-9ffb1aa81f39';

UPDATE governance_prompts SET status = 'implemented', content = 'Proteção contra exfiltração: RLS limita dados por organização, limite de 500 rows e 5MB nas exportações admin, CSP restringe connect-src a domínios autorizados (supabase.co, lovable.app). Utilitário sanitizeInput limita tamanho de inputs.', updated_at = now() WHERE id = '485fa81e-48c8-4659-bc64-a4a34392dcd7';

UPDATE governance_prompts SET status = 'implemented', content = 'Proteção contra roubo de tokens: CSP bloqueia scripts de terceiros que poderiam capturar JWT do localStorage. Sanitização HTML previne XSS (vetor principal de roubo). JWT do Supabase expira automaticamente. Service Role Key nunca exposta no client.', updated_at = now() WHERE id = '88c9f231-62c6-49ad-be27-a86f606f53c5';

UPDATE governance_prompts SET status = 'implemented', updated_at = now() WHERE id = 'b09c91bb-bcb5-4c74-b7b5-49ec20ea7eac';