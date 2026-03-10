

## Feedback Visual ao Compartilhar Lead

### Problema
Quando um membro é marcado como compartilhado, a única diferença visual é o badge "Compartilhado" vs "Adicionar". Falta destaque visual na linha inteira para deixar claro quem já tem acesso.

### Implementação

Atualizar o `ShareConversationDialog.tsx`:

1. **Linha do membro compartilhado**: Adicionar fundo verde sutil (`bg-green-500/10 border border-green-500/20`) quando `isShared` for true.

2. **Badge "Compartilhado"**: Usar variante com cor verde (`bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`) com ícone de check.

3. **Badge "Adicionar"**: Manter como está (outline, muted).

4. **Avatar ring**: Adicionar `ring-2 ring-green-500` no avatar quando compartilhado.

Resultado: ao clicar em "Adicionar", a linha inteira muda de aparência com fundo verde e badge verde, dando feedback imediato e claro de que o membro foi selecionado.

