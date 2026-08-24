import { describe, it, expect } from 'vitest';
import { contactAppearsInWorkspace, workspaceVisibilityOrClause } from '../contactWorkspaces';

const WS_A = '11111111-1111-1111-1111-111111111111';
const WS_B = '22222222-2222-2222-2222-222222222222';

describe('contactAppearsInWorkspace', () => {
  it('aparece no workspace de origem', () => {
    expect(contactAppearsInWorkspace({ workspace_id: WS_A }, WS_A)).toBe(true);
  });

  it('aparece no workspace com quem foi compartilhado', () => {
    expect(
      contactAppearsInWorkspace({ workspace_id: WS_A, shared_workspace_ids: [WS_B] }, WS_B),
    ).toBe(true);
  });

  it('não aparece em workspace alheio -- era o caso que barrava a criação', () => {
    expect(contactAppearsInWorkspace({ workspace_id: WS_A, shared_workspace_ids: [] }, WS_B)).toBe(false);
  });

  it('trata array ausente (linha antiga, antes da coluna existir)', () => {
    expect(contactAppearsInWorkspace({ workspace_id: WS_A }, WS_B)).toBe(false);
    expect(contactAppearsInWorkspace({ workspace_id: WS_A, shared_workspace_ids: null }, WS_B)).toBe(false);
  });

  it('"Não atribuído" e visão geral olham só o workspace de origem', () => {
    expect(contactAppearsInWorkspace({ workspace_id: null }, 'unassigned')).toBe(true);
    expect(contactAppearsInWorkspace({ workspace_id: WS_A }, 'unassigned')).toBe(false);
    // Sem workspace selecionado não há destino para compartilhar: só o órfão "cabe".
    expect(contactAppearsInWorkspace({ workspace_id: null }, null)).toBe(true);
    expect(contactAppearsInWorkspace({ workspace_id: WS_A, shared_workspace_ids: [WS_B] }, null)).toBe(false);
  });
});

describe('workspaceVisibilityOrClause', () => {
  it('cobre origem e compartilhados na mesma cláusula', () => {
    expect(workspaceVisibilityOrClause(WS_A)).toBe(
      `workspace_id.eq.${WS_A},shared_workspace_ids.cs.{${WS_A}}`,
    );
  });
});
