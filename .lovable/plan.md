
**Diagnóstico do Problema:**
Atualmente, o sistema mistura dois conceitos diferentes que causam essa confusão: 
1. **Status da Conversa:** (Aberto, Resolvido)
2. **Modo de Atendimento:** (IA, Equipe, Fila)

O termo "Pendente" hoje é usado tanto como Status quanto como "Fila de Espera", o que gera ruído. A palavra "Resolvido" muitas vezes conflita com "Arquivado".

---

### Proposta: O Padrão de Mercado (Intercom, Zendesk, Chatwoot)
Para deixar o fluxo super intuitivo, propomos separar claramente **"Com quem a conversa está"** de **"Qual é a situação dela"**.

#### 1️⃣ Fases do Atendimento (Caixas de Entrada)
Isso define de quem é a "posse" da conversa no momento:
*   🤖 **IA (Bot):** A inteligência artificial está interagindo com o cliente.
*   🕒 **Fila (Aguardando):** O cliente quer falar com um humano ou o bot não soube responder. O cliente fica "na sala de espera" até alguém puxar.
*   👤 **Em Atendimento:** Um atendente humano puxou a conversa da Fila e está conversando com o cliente.

#### 2️⃣ Status da Conversa
Isso define apenas se o problema acabou ou não:
*   🟢 **Aberto:** O caso está ativo (pode estar com o Bot, na Fila ou com o Atendente).
*   ✅ **Resolvido (Finalizado):** O atendimento acabou. Ao "Resolver" uma conversa, ela sai da caixa de entrada principal e vai para o histórico. Caso o cliente mande nova mensagem amanhã, ela reabre.

---

### O que vamos implementar no código:

1. **Atualização da Interface (Tabs e Filtros):** 
   - Renomear as abas para: `Todas`, `Fila`, `Em Atendimento` e `IA`.
   - Remover qualquer menção ambígua a "Pendente" na tela.

2. **Fluxo de Botões Intuitivo (Ações da Conversa):**
   - Se a conversa está na Fila: Botão verde gigante **"Assumir Atendimento"**.
   - Se a conversa está Em Atendimento: Botões **"Resolver/Finalizar"** e **"Devolver para Fila"**.
   - Se a conversa está Resolvida: Fica no histórico (Aba Arquivadas) com botão de **"Reabrir"**.

3. **Ajuste no Dashboard e Recentes:**
   - Padronizar os "badges" de status no componente de `RecentConversations` e em todas as tabelas para refletirem essa nova lógica simples (Aberto vs Resolvido / Fila vs Atendimento).

4. **Tradução no Frontend:**
   - Vamos mapear as variáveis de banco de dados para os novos nomes na tela. Exemplo: `service_mode = pendente` vira oficialmente **Fila** e `service_mode = ativo` vira **Em Atendimento**.

Com isso, o fluxo de trabalho da equipe ficará óbvio: O objetivo diário é zerar a **Fila** puxando as conversas para **Em Atendimento**, e depois limpar o **Em Atendimento** clicando em **Resolver**.
