import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { cn } from '@/lib/utils';
import {
  Play, Flag, MessageSquare, ImageIcon, Video, Code2, Headphones,
  Type, Hash, Mail, Globe, Calendar, Clock, Phone, MousePointerClick,
  Star, Link2, GitBranch, ArrowRight, Timer, Shuffle, CornerDownLeft,
  BarChart3, Trash2
} from 'lucide-react';

// --- Start Node ---
export function QuizStartNode({ selected }: NodeProps) {
  return (
    <div className={cn(
      "group relative px-5 py-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg border-2 transition-all min-w-[140px]",
      selected ? 'border-white ring-2 ring-green-400' : 'border-green-400/50'
    )}>
      <div className="flex items-center gap-2 text-white">
        <Play className="h-4 w-4" />
        <span className="font-semibold text-sm">Início</span>
      </div>
      <Handle type="source" position={Position.Right}
        className="!w-3 !h-3 !bg-white !border-2 !border-green-500 opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5" />
    </div>
  );
}

// --- Group Node (Typebot-style) ---
interface GroupNodeData extends Record<string, unknown> {
  label?: string;
  blocks?: Array<{
    id: string;
    type: string;
    data: Record<string, any>;
  }>;
}

type GroupNode = Node<GroupNodeData>;

const blockIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'quiz-bubble-text': MessageSquare,
  'quiz-bubble-image': ImageIcon,
  'quiz-bubble-video': Video,
  'quiz-bubble-embed': Code2,
  'quiz-bubble-audio': Headphones,
  'quiz-input-text': Type,
  'quiz-input-number': Hash,
  'quiz-input-email': Mail,
  'quiz-input-website': Globe,
  'quiz-input-date': Calendar,
  'quiz-input-time': Clock,
  'quiz-input-phone': Phone,
  'quiz-input-buttons': MousePointerClick,
  'quiz-input-pic-choice': ImageIcon,
  'quiz-input-rating': Star,
  'quiz-input-file': Link2,
  'quiz-logic-condition': GitBranch,
  'quiz-logic-redirect': ArrowRight,
  'quiz-logic-wait': Timer,
  'quiz-logic-ab-test': Shuffle,
  'quiz-logic-jump': CornerDownLeft,
  'quiz-event-pixel': BarChart3,
};

const blockColors: Record<string, string> = {
  'quiz-bubble': 'text-blue-400',
  'quiz-input': 'text-orange-400',
  'quiz-logic': 'text-purple-400',
  'quiz-event': 'text-green-400',
};

function getBlockColor(type: string) {
  const prefix = type.split('-').slice(0, 2).join('-');
  return blockColors[prefix] || 'text-muted-foreground';
}

function getBlockLabel(block: { type: string; data: Record<string, any> }) {
  const d = block.data;
  // For input blocks, show the question/prompt if configured
  const prompt = d.prompt as string | undefined;
  
  switch (block.type) {
    case 'quiz-bubble-text': return d.content?.slice(0, 40) || 'Clique para editar...';
    case 'quiz-bubble-image': return d.url ? 'Imagem' : '📷 Clique para editar...';
    case 'quiz-bubble-video': return d.url ? 'Vídeo' : '🎬 Clique para editar...';
    case 'quiz-bubble-embed': return d.url || 'Embed';
    case 'quiz-bubble-audio': return d.url ? 'Áudio' : '🎧 Clique para editar...';
    case 'quiz-input-text': return prompt?.slice(0, 50) || d.placeholder || 'Digite sua resposta...';
    case 'quiz-input-number': return prompt?.slice(0, 50) || d.placeholder || 'Digite um número...';
    case 'quiz-input-email': return prompt?.slice(0, 50) || d.placeholder || 'Digite seu email...';
    case 'quiz-input-website': return prompt?.slice(0, 50) || d.placeholder || 'Digite uma URL...';
    case 'quiz-input-date': return prompt?.slice(0, 50) || 'Escolha uma data...';
    case 'quiz-input-time': return prompt?.slice(0, 50) || 'Escolha um horário...';
    case 'quiz-input-phone': return prompt?.slice(0, 50) || d.placeholder || 'Digite seu telefone...';
    case 'quiz-input-file': return prompt?.slice(0, 50) || 'Enviar arquivo...';
    case 'quiz-input-rating': return prompt?.slice(0, 50) || `Avaliação (1-${d.maxRating || 5})`;
    case 'quiz-input-buttons':
      return prompt?.slice(0, 50) || (d.options as any[])?.map((o: any) => o.label).join(', ') || 'Adicionar botões...';
    case 'quiz-input-pic-choice':
      return prompt?.slice(0, 50) || ((d.options as any[])?.length ? `${(d.options as any[]).length} escolhas` : 'Adicionar escolhas...');
    case 'quiz-logic-condition': return 'Condição';
    case 'quiz-logic-redirect': return d.url || 'Redirecionar';
    case 'quiz-logic-wait': return `Esperar ${d.seconds || 3}s`;
    case 'quiz-logic-ab-test': return 'Teste A/B';
    case 'quiz-logic-jump': return d.targetGroup || 'Pular';
    case 'quiz-event-pixel': return d.platform ? `${d.platform} - ${d.eventName || 'PageView'}` : 'Configurar pixel...';
    default: return block.type;
  }
}

export function QuizGroupNode({ data, selected, id }: NodeProps<GroupNode>) {
  const blocks = (data.blocks as GroupNodeData['blocks']) || [];
  const label = (data.label as string) || 'Grupo';

  // Check if last block is a buttons/choice type for per-option handles
  const lastBlock = blocks[blocks.length - 1];
  const hasOptionHandles = lastBlock &&
    ['quiz-input-buttons', 'quiz-input-pic-choice'].includes(lastBlock.type) &&
    (lastBlock.data.options as any[])?.length > 0;

  const options = hasOptionHandles ? (lastBlock.data.options as any[]) : [];

  // Check if last block is condition for true/false handles
  const isCondition = lastBlock?.type === 'quiz-logic-condition';
  // Check if last block is AB test
  const isABTest = lastBlock?.type === 'quiz-logic-ab-test';
  // Check if last block is date with "Não sei" enabled
  const isDateWithUnknown = lastBlock?.type === 'quiz-input-date' && lastBlock.data.allowUnknown !== false;

  return (
    <div className={cn(
      "group relative min-w-[260px] max-w-[320px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
      selected ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-border'
    )}>
      <Handle type="target" position={Position.Left}
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5" />

      {/* Group header */}
      <div className="px-3 py-2 border-b border-border/50">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      </div>

      {/* Blocks */}
      <div className="p-2 space-y-1">
        {blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Solte blocos aqui...
          </p>
        ) : (
          blocks.map((block, idx) => {
            const Icon = blockIcons[block.type] || Type;
            const color = getBlockColor(block.type);
            const blockLabel = getBlockLabel(block);

            const onBlockClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('quiz-block-click', { detail: { nodeId: id, blockIdx: idx } }));
            };

            // For buttons, show each option as a row
            if (block.type === 'quiz-input-buttons' && (block.data.options as any[])?.length) {
              return (
                <div key={block.id} className="space-y-1 cursor-pointer" onClick={onBlockClick}>
                  {(block.data.options as any[]).map((opt: any, optIdx: number) => (
                    <div key={optIdx} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border/50 hover:bg-accent/50 transition-colors">
                      <MousePointerClick className={cn("h-3.5 w-3.5 flex-shrink-0", color)} />
                      <span className="text-xs text-foreground truncate flex-1">{opt.label}</span>
                    </div>
                  ))}
                </div>
              );
            }

            return (
              <div key={block.id} onClick={onBlockClick}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border/50 cursor-pointer hover:bg-accent/50 transition-colors">
                <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", color)} />
                <span className="text-xs text-foreground truncate flex-1">{blockLabel}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Output handles */}
      {hasOptionHandles ? (
        <>
          {options.map((opt: any, idx: number) => {
            const totalOptions = options.length;
            const topPercent = ((idx + 1) / (totalOptions + 1)) * 100;
            return (
              <div key={idx}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`option-${idx}`}
                  className="!w-3 !h-3 !bg-orange-500 !border-2 !border-background !-right-1.5"
                  style={{ top: `${topPercent}%` }}
                />
                <span
                  className="absolute text-[9px] text-muted-foreground font-medium whitespace-nowrap pointer-events-none"
                  style={{ right: '-8px', top: `${topPercent}%`, transform: 'translate(100%, -50%)', paddingLeft: '4px' }}
                >
                  {opt.label}
                </span>
              </div>
            );
          })}
        </>
      ) : isCondition ? (
        <>
          <Handle type="source" position={Position.Right} id="true"
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-background !-right-1.5"
            style={{ top: '40%' }} />
          <span className="absolute text-[9px] text-green-500 font-medium whitespace-nowrap pointer-events-none"
            style={{ right: '-8px', top: '40%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}>
             True
          </span>
          <Handle type="source" position={Position.Right} id="false"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-background !-right-1.5"
            style={{ top: '70%' }} />
          <span className="absolute text-[9px] text-red-500 font-medium whitespace-nowrap pointer-events-none"
            style={{ right: '-8px', top: '70%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}>
            False
          </span>
        </>
      ) : isABTest ? (
        <>
          <Handle type="source" position={Position.Right} id="a"
            className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background !-right-1.5"
            style={{ top: '40%' }} />
          <span className="absolute text-[9px] text-blue-500 font-medium whitespace-nowrap pointer-events-none"
            style={{ right: '-8px', top: '40%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}>A</span>
          <Handle type="source" position={Position.Right} id="b"
            className="!w-3 !h-3 !bg-purple-500 !border-2 !border-background !-right-1.5"
            style={{ top: '70%' }} />
          <span className="absolute text-[9px] text-purple-500 font-medium whitespace-nowrap pointer-events-none"
            style={{ right: '-8px', top: '70%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}>B</span>
        </>
      ) : isDateWithUnknown ? (
        <>
          <Handle type="source" position={Position.Right} id="date-answered"
            className="!w-3 !h-3 !bg-orange-500 !border-2 !border-background !-right-1.5"
            style={{ top: '40%' }} />
          <span className="absolute text-[9px] text-orange-500 font-medium whitespace-nowrap pointer-events-none"
            style={{ right: '-8px', top: '40%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}>
            Data
          </span>
          <Handle type="source" position={Position.Right} id="date-unknown"
            className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background !-right-1.5"
            style={{ top: '70%' }} />
          <span className="absolute text-[9px] text-muted-foreground font-medium whitespace-nowrap pointer-events-none"
            style={{ right: '-8px', top: '70%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}>
            Não sei
          </span>
        </>
      ) : (
        <Handle type="source" position={Position.Right}
          className="!w-3 !h-3 !bg-orange-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5" />
      )}
    </div>
  );
}

export const quizNodeTypes = {
  'quiz-start': QuizStartNode,
  'quiz-group': QuizGroupNode,
};
