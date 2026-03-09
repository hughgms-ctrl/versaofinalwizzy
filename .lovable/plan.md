
Excelente observação. Você tem toda a razão: **Envio em Massa** (selecionar contatos e disparar uma mensagem/fluxo) é uma ação ativa e não deveria estar misturada com **Campanhas** (que são automações/gatilhos passivos que rodam no fundo).

O sistema já possui a página de "Agendamentos" que faz exatamente o papel de selecionar contatos (por Tag ou manualmente) e disparar fluxos/mensagens. Vamos adaptar isso para ficar no padrão de mercado.

Aqui está o plano de implementação:

### 1. Criar a aba independente de "Envio em Massa"
- Vou renomear a aba atual de "Agendamentos" no menu lateral para **"Envios em Massa"**.
- Essa tela será o local oficial onde você poderá selecionar contatos individualmente, por **Tag** ou **Todos**, escolher um Fluxo ou Mensagem, e decidir se o envio será **imediato** ou **agendado**.

### 2. Limpar e Organizar as Campanhas
- Vou remover a opção "Manual" da criação de Campanhas.
- Adicionarei o novo gatilho **"Tag Adicionada"** (muito comum no BotConversa e outras ferramentas), que permitirá iniciar um fluxo automaticamente assim que uma etiqueta específica for colocada em um contato.
- Melhorarei a explicação na opção **Webhook**, mostrando um exemplo visual de como o link é gerado para facilitar a integração com sistemas externos (ex: Hotmart, Kiwify, CRMs).

### Resumo das Mudanças Técnicas
- **Frontend**: Atualização do `Sidebar.tsx`, `MobileNav.tsx`, `ScheduledMessagesPage.tsx` e `CampaignDialog.tsx`.
- **Backend (Supabase)**: Criação de uma *Edge Function* e gatilho de banco de dados (`trigger`) na tabela `contact_tags` para escutar adições de tags e disparar automaticamente o fluxo da campanha associada.

Pronto para executar essas mudanças?
