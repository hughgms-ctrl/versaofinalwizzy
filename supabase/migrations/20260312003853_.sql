UPDATE governance_checks 
SET notes = 'Rate monitoring (log-only) — nunca rejeita requisições para evitar perda de mensagens. Monitora volume alto via console.warn sem retornar 429.'
WHERE name = 'Rate Limiting';;
