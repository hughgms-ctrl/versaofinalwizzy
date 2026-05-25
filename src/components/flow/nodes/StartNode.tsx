import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';

export function StartNode({ selected }: NodeProps) {
  return (
    <div 
      className={`
        group relative px-4 py-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 
        shadow-lg border-2 transition-all
        ${selected ? 'border-white ring-2 ring-green-400' : 'border-green-400/50'}
      `}
    >
      <div className="flex items-center gap-2 text-white">
        <Play className="h-4 w-4" />
        <span className="font-semibold text-sm">Início</span>
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-white !border-2 !border-green-500 opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
      />
    </div>
  );
}
