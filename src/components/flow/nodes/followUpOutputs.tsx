import { Handle, Position } from '@xyflow/react';
import { MousePointerClick } from 'lucide-react';
import type { FollowUpOutput } from './followUpHandles';

/** Uma linha por botão, com a alça ancorada na linha. */
export function FollowUpOutputRows({ outputs }: { outputs: FollowUpOutput[] }) {
  if (outputs.length === 0) return null;

  return (
    <div className="space-y-1 pt-2 mt-1 border-t border-dashed border-border/60">
      <span className="text-[10px] text-blue-500/80 font-medium">Botões do follow-up</span>
      {outputs.map((output) => (
        <div key={output.handleId} className="relative">
          <div className="text-[11px] px-2 py-1.5 rounded-md bg-blue-500/10 text-foreground flex items-center gap-1.5 pr-5">
            <MousePointerClick className="h-3 w-3 text-blue-500 shrink-0" />
            <span className="truncate">{output.label}</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id={output.handleId}
            className="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-background !-right-[18px]"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Bloco completo de saídas para os nós que hoje usam alças posicionadas em % —
 * com botões de follow-up elas viram linhas, senão os pontos se sobreporiam.
 */
export function WaitOutputRows({ outputs }: { outputs: FollowUpOutput[] }) {
  return (
    <div className="space-y-1 pt-2 mt-1 border-t border-dashed border-border/60">
      <div className="relative">
        <div className="text-[11px] px-2 py-1.5 rounded-md bg-green-500/10 text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5 pr-5">
          ✓ <span className="truncate">Respondeu</span>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id="responded"
          className="!w-2.5 !h-2.5 !bg-green-500 !border-2 !border-background !-right-[18px]"
        />
      </div>

      {outputs.map((output) => (
        <div key={output.handleId} className="relative">
          <div className="text-[11px] px-2 py-1.5 rounded-md bg-blue-500/10 text-foreground flex items-center gap-1.5 pr-5">
            <MousePointerClick className="h-3 w-3 text-blue-500 shrink-0" />
            <span className="truncate">{output.label}</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id={output.handleId}
            className="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-background !-right-[18px]"
          />
        </div>
      ))}

      <div className="relative">
        <div className="text-[11px] px-2 py-1.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5 pr-5">
          ✗ <span className="truncate">Timeout</span>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id="timeout"
          className="!w-2.5 !h-2.5 !bg-red-500 !border-2 !border-background !-right-[18px]"
        />
      </div>
    </div>
  );
}
