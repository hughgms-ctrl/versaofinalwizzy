-- Mark items that are actually already implemented
UPDATE governance_checks SET status = 'done', notes = 'Webhooks usam instance_id+token do UAZAPI para autenticação. Widget-submit usa token público por widget.', updated_at = now() WHERE name = 'Tokens únicos para webhooks públicos';

UPDATE governance_checks SET status = 'done', notes = 'Supabase gerencia JWT com rotação automática. Edge functions validam token a cada request.', updated_at = now() WHERE name = 'Tokens rotativos (15min)';

UPDATE governance_checks SET status = 'done', notes = 'Loading states implementados em todas as mutations (isPending), skeletons nos queries, e disabled states em botões.', updated_at = now() WHERE name = 'Loading states em operações críticas';

UPDATE governance_checks SET status = 'done', notes = 'ProtectedRoute redireciona para login. AdminProtectedRoute mostra erro de acesso. Toast de erro em mutations.', updated_at = now() WHERE name = 'Feedback de erros de permissão';

UPDATE governance_checks SET status = 'done', notes = 'Edge functions usam console.log estruturado com prefixos [FUNCTION_NAME]. Erros retornados com status codes corretos.', updated_at = now() WHERE name = 'Logs de erro estruturados';;
