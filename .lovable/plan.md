

## Plan: Add "Avançar automaticamente" toggle to AI Handoff node

### Problem
When the AI agent concludes its task (e.g., qualifies/disqualifies a lead), it should advance the flow immediately. However, the behavior is inconsistent — some flows advance automatically while others wait for a customer response. The root cause is that the AI model sometimes doesn't call `send_reply` + `finalizar_interacao` in the same turn, or the prompt instructions aren't deterministic enough.

### Solution
Add a toggle **"Avançar automaticamente"** (auto-advance) to the AI Handoff node properties panel. This creates a **deterministic, system-level** control:

- **ON (default)**: After the AI calls `finalizar_interacao`, the system advances the flow immediately without waiting for another customer message.
- **OFF**: After the AI concludes, the flow waits for the customer to send another message before advancing (current fallback behavior in some cases).

### Changes

#### 1. UI: `src/components/flow/NodePropertiesPanel.tsx`
- Add a `Switch` toggle in the `ai-handoff` case (after the "Resultados Esperados" section, around line 1477).
- Property name: `autoAdvance` (default: `true`).
- Label: "Avançar automaticamente"
- Description: "Após o agente finalizar, avança para o próximo nó sem aguardar nova mensagem do cliente."

#### 2. Backend: `supabase/functions/flow-execute/index.ts`
- In `executeAIHandoff` (~line 525), include `autoAdvance` in the prompt instructions:
  - If `autoAdvance` is `true` (or undefined/default): keep the existing strong instruction to call `send_reply` + `finalizar_interacao` in the same turn.
  - If `autoAdvance` is `false`: instruct the AI to send the final message and wait for the customer to respond before the flow advances.
- Pass `autoAdvance` into the `ai_handoff_context` metadata so the orchestrator can use it.

#### 3. Backend: `supabase/functions/agent-orchestrator/index.ts`
- In `invokeAgentAI` (~line 1249-1262): Conditionally apply the "REGRA CRÍTICA" about calling `send_reply` + `finalizar_interacao` in the same turn based on `autoAdvance`.
- In the legacy `finalizar_interacao` handler (~line 2118): When `autoAdvance` is `false`, mark the flow execution as `waiting_input` at the current node instead of immediately calling `flow-execute` for the next node. The webhook will then resume it when the customer sends a message.

#### 4. Visual: `src/components/flow/nodes/AINodes.tsx`
- No changes needed for the node visual — the toggle is only in the properties dialog.

### Technical detail
The `autoAdvance` property defaults to `true` to maintain backward compatibility and fix the current inconsistency. Existing flows without this property will behave as auto-advance (the desired behavior).

