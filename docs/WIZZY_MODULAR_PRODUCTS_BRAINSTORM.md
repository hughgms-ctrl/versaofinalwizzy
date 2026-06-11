# Brainstorm: Produtos Modulares do Wizzy

Data: 2026-06-11

## Ideia central

Transformar o Wizzy em uma plataforma principal, onde ferramentas individuais podem ser vendidas separadamente e entregues dentro da mesma area de membros.

Exemplos de ferramentas:

- Wizzy CNIS
- Wizzy Sign
- Wizzy Flow
- Wizzy CRM
- futuras ferramentas do ecossistema Wizzy

A pessoa pode comprar apenas uma ferramenta avulsa, como o Wizzy CNIS por um valor mensal baixo, mas para usar precisa entrar no Wizzy. Dentro do Wizzy, ela enxerga todas as ferramentas disponiveis, com as ferramentas compradas liberadas e as demais bloqueadas.

## Objetivo do modelo

- Vender ferramentas avulsas como porta de entrada.
- Usar o proprio Wizzy como vitrine interna para outras ferramentas.
- Permitir upgrade natural para uma assinatura completa.
- Evitar criar varios produtos desconectados.
- Centralizar login, acesso, pagamento, permissao e suporte.

## Experiencia do usuario

### Area de ferramentas

A pagina de ferramentas funcionaria como uma area de membros e uma vitrine interna.

Cada ferramenta poderia aparecer como um card com:

- nome
- icone
- descricao curta
- status de acesso
- preco avulso, quando aplicavel
- indicacao se esta incluida no plano completo
- botao contextual

Possiveis estados:

- liberado
- bloqueado
- em breve
- incluso no plano atual
- disponivel para upgrade

Possiveis botoes:

- Abrir ferramenta
- Ver demonstracao
- Comprar acesso
- Fazer upgrade

### Ferramentas bloqueadas

Ferramentas bloqueadas devem continuar visiveis. Ao clicar no cadeado ou no card bloqueado, o usuario entra em uma pagina simples de venda interna.

Essa pagina pode conter:

- video de demonstracao
- descricao objetiva da ferramenta
- beneficios principais
- preco avulso
- botao de compra
- chamada alternativa para o plano completo

Exemplo:

> Use o Wizzy CNIS por R$ 9,90/mes ou desbloqueie todas as ferramentas com o Wizzy completo.

## Modelos de acesso

### Conta gratuita

O usuario pode entrar no Wizzy e ver as ferramentas disponiveis, mas quase tudo fica bloqueado.

Pode servir para:

- assistir demonstracoes
- conhecer as ferramentas
- iniciar uma compra
- experimentar algum recurso gratuito limitado, se fizer sentido

### Assinatura avulsa por ferramenta

O usuario paga por uma ferramenta especifica.

Exemplo:

- CNIS mensal libera apenas o Wizzy CNIS
- Sign mensal libera apenas o Wizzy Sign
- Flow mensal libera apenas o Wizzy Flow
- CRM mensal libera apenas o Wizzy CRM

Mesmo pagando apenas uma ferramenta, o usuario continua dentro do Wizzy e ve as demais opcoes bloqueadas.

### Assinatura completa

Um plano maior libera todas ou quase todas as ferramentas.

Esse plano deve ser apresentado como a evolucao natural para quem usa mais de uma ferramenta.

Exemplo de logica comercial:

- CNIS avulso: R$ 9,90/mes
- Sign avulso: R$ 14,90/mes
- Flow avulso: R$ 19,90/mes
- CRM avulso: R$ 29,90/mes
- Wizzy completo: valor que faca sentido quando a pessoa quer duas ou mais ferramentas

## Migracao e upgrade

O usuario que comecou em uma ferramenta avulsa deve conseguir migrar para o plano completo.

Primeira versao recomendada:

- cancelar ou substituir a assinatura avulsa
- ativar a assinatura completa
- manter a experiencia simples

Mensagem possivel:

> Ao migrar para o Wizzy completo, sua assinatura avulsa sera substituida pelo novo plano.

Versao futura mais sofisticada:

- calcular credito proporcional do periodo ja pago
- aplicar desconto no primeiro ciclo do plano completo
- registrar a migracao no historico do usuario

## Separacao conceitual importante

Para evitar confusao no futuro, separar claramente:

### Produto

O que esta sendo vendido.

Exemplo:

- Wizzy CNIS
- Wizzy Sign
- Wizzy Flow
- Wizzy CRM

### Plano

Como o produto esta sendo vendido.

Exemplo:

- CNIS mensal
- CNIS anual
- Wizzy completo mensal
- Wizzy completo anual

### Acesso

O que o usuario pode usar agora.

Exemplo:

- acesso ao CNIS via assinatura avulsa
- acesso ao CRM via plano completo
- acesso ao Flow via liberacao manual
- acesso temporario via trial

Essa separacao e importante porque um usuario pode ter acesso a uma ferramenta por varios motivos:

- comprou a ferramenta avulsa
- assinou o plano completo
- recebeu liberacao manual
- esta em periodo de teste
- ganhou cupom
- tem acesso vitalicio
- veio de uma migracao antiga

## Painel admin

O painel admin precisa ser tratado como parte central desse modelo. Ele nao deve gerenciar apenas usuarios, mas produtos, planos, acessos e pagamentos.

### Menus sugeridos

- Dashboard
- Usuarios
- Ferramentas
- Planos
- Assinaturas
- Pagamentos
- Cupons
- Paginas de venda
- Logs de acesso

### Ferramentas

O admin deve conseguir cadastrar e editar ferramentas.

Campos possiveis:

- nome
- slug
- status: ativo, oculto, em breve
- descricao curta
- descricao de venda
- icone
- ordem na vitrine
- preco avulso exibido
- video de demonstracao
- se aparece ou nao na pagina de ferramentas
- permissoes internas liberadas

### Planos

O admin deve conseguir definir quais planos existem e quais ferramentas cada plano libera.

Campos possiveis:

- nome do plano
- preco
- recorrencia
- ferramentas incluidas
- gateway de pagamento
- id do produto/plano no gateway
- status
- regras de upgrade ou migracao

### Usuarios

Na tela de cada usuario, o admin deve enxergar rapidamente:

- dados da conta
- plano atual
- ferramentas liberadas
- origem de cada acesso
- status de pagamento
- historico de assinaturas
- historico de pagamentos
- botoes para liberar ou bloquear ferramenta manualmente
- botao para migrar plano

Exemplo de exibicao:

- CNIS: ativo via assinatura avulsa
- Sign: bloqueado
- Flow: ativo via plano completo
- CRM: trial ate determinada data

### Assinaturas e pagamentos

O admin deve permitir acompanhar:

- assinaturas ativas
- assinaturas avulsas
- assinaturas do plano completo
- pagamentos em atraso
- cancelamentos
- upgrades recentes
- acessos manuais
- falhas de pagamento

### Paginas de venda internas

Seria ideal editar as paginas de venda de cada ferramenta pelo admin.

Campos possiveis:

- titulo
- video
- descricao
- beneficios
- preco exibido
- botao de compra
- alternativa de upgrade para o plano completo

## Permissoes e entitlements

O sistema deve evitar depender apenas do nome do plano do usuario.

Melhor pergunta:

> Quais acessos ativos esse usuario possui?

Possiveis permissoes:

- cnis_active
- sign_active
- flow_active
- crm_active
- full_suite_active

Um plano completo poderia liberar varias permissoes ao mesmo tempo. Uma assinatura avulsa liberaria apenas a permissao correspondente.

## Riscos a evitar

- vender ferramentas avulsas sem centralizar permissao
- esconder completamente ferramentas bloqueadas
- misturar produto, plano e acesso em uma unica entidade
- depender de ajustes manuais sem historico
- nao registrar origem do acesso
- nao prever migracao de avulso para completo
- criar muitas excecoes sem painel admin claro

## Frase de posicionamento possivel

> Use so a ferramenta que precisa agora. Quando quiser, migre para o Wizzy completo e desbloqueie todo o ecossistema.

## Decisoes em aberto

- Quais ferramentas serao vendidas avulsas primeiro?
- Quais ferramentas entram no plano completo?
- O plano completo libera tudo ou existem ferramentas premium separadas?
- Havera plano anual?
- Havera trial?
- O usuario gratuito podera testar algo ou apenas assistir demonstracoes?
- Qual gateway de pagamento sera usado?
- Como funcionara upgrade proporcional no futuro?
- Quais acessos precisam ser administrados manualmente?
- O CRM tera modo demo com dados ficticios ou apenas video?

## Proxima etapa sugerida

Quando este tema for retomado, transformar o brainstorm em uma especificacao inicial com:

- modelo de dados
- fluxo de compra
- fluxo de upgrade
- regras de permissao
- telas do admin
- telas da area de ferramentas
- integracao com gateway de pagamento
