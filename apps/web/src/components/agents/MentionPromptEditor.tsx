import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAIAgents } from '@/hooks/useAIAgents';
import { useTags } from '@/hooks/useTags';
import { useFlows } from '@/hooks/useFlows';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { Bot, Tag, GitBranch, Columns, ChevronRight, Building2 } from 'lucide-react';
import { useAgentFunctionRoles } from '@/hooks/useAgentFunctionRoles';
import { cn } from '@/lib/utils';

interface MentionPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

type MentionType = 'agent' | 'function';
type FunctionCategory = 'pipeline' | 'tag' | 'flow' | 'department';
type DrillStep = 'category' | 'select_pipeline' | 'select_column' | 'select_tag' | 'select_flow' | 'select_department';

interface MentionState {
  active: boolean;
  type: MentionType | null;
  triggerIndex: number;
  search: string;
  drillStep: DrillStep;
  selectedPipelineId?: string;
}

const FUNCTION_CATEGORIES: { id: FunctionCategory; label: string; icon: typeof Columns }[] = [
  { id: 'pipeline', label: 'Pipeline', icon: Columns },
  { id: 'tag', label: 'Tag', icon: Tag },
  { id: 'flow', label: 'Fluxo', icon: GitBranch },
  { id: 'department', label: 'Departamento', icon: Building2 },
];

export function MentionPromptEditor({ value, onChange, placeholder, className }: MentionPromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [mention, setMention] = useState<MentionState>({
    active: false, type: null, triggerIndex: -1, search: '', drillStep: 'category',
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const { data: agents = [] } = useAIAgents();
  const { data: tags = [] } = useTags();
  const { data: flows = [] } = useFlows();
  const { data: pipelines = [] } = usePipelines();
  const { data: columns = [] } = usePipelineColumns(mention.selectedPipelineId);
  const { data: functionRoles = [] } = useAgentFunctionRoles();
  const departments = useMemo(() => functionRoles.map(r => ({ id: r.id, name: r.label })), [functionRoles]);

  const getItems = useCallback(() => {
    const search = mention.search.toLowerCase();
    if (mention.type === 'agent') {
      return agents
        .filter(a => a.name.toLowerCase().includes(search))
        .map(a => ({ id: a.id, label: a.name, sub: a.function_role || '', icon: Bot, hasChildren: false }));
    }
    if (mention.type === 'function') {
      if (mention.drillStep === 'category') {
        return FUNCTION_CATEGORIES
          .filter(c => c.label.toLowerCase().includes(search))
          .map(c => ({ id: c.id, label: c.label, sub: '', icon: c.icon, hasChildren: true }));
      }
      if (mention.drillStep === 'select_pipeline') {
        return pipelines
          .filter(p => p.name.toLowerCase().includes(search))
          .map(p => ({ id: p.id, label: p.name, sub: '', icon: Columns, hasChildren: true }));
      }
      if (mention.drillStep === 'select_column') {
        return columns
          .filter(c => c.name.toLowerCase().includes(search))
          .map(c => ({ id: c.id, label: c.name, sub: '', icon: Columns, hasChildren: false }));
      }
      if (mention.drillStep === 'select_tag') {
        return tags
          .filter(t => t.name.toLowerCase().includes(search))
          .map(t => ({ id: t.id, label: t.name, sub: '', icon: Tag, hasChildren: false }));
      }
      if (mention.drillStep === 'select_flow') {
        return flows
          .filter(f => f.name.toLowerCase().includes(search))
          .map(f => ({ id: f.id, label: f.name, sub: '', icon: GitBranch, hasChildren: false }));
      }
      if (mention.drillStep === 'select_department') {
        return departments
          .filter(d => d.name.toLowerCase().includes(search))
          .map(d => ({ id: d.id, label: d.name, sub: '', icon: Building2, hasChildren: false }));
      }
    }
    return [];
  }, [mention, agents, tags, flows, pipelines, columns, departments]);

  const items = getItems();

  useEffect(() => { setSelectedIndex(0); }, [mention.search, mention.drillStep]);

  const closeMention = () => {
    setMention({ active: false, type: null, triggerIndex: -1, search: '', drillStep: 'category' });
  };

  const insertMention = (text: string) => {
    const before = value.slice(0, mention.triggerIndex);
    const cursorPos = textareaRef.current?.selectionStart ?? (mention.triggerIndex + mention.search.length + 1);
    const after = value.slice(cursorPos);
    const newValue = before + text + ' ' + after;
    onChange(newValue);
    closeMention();
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + text.length + 1;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const selectItem = (item: any) => {
    if (mention.type === 'agent') {
      insertMention(`@[${item.label}]`);
      return;
    }
    if (mention.drillStep === 'category') {
      const cat = item.id as FunctionCategory;
      if (cat === 'pipeline') {
        setMention(prev => ({ ...prev, drillStep: 'select_pipeline', search: '' }));
      } else if (cat === 'tag') {
        setMention(prev => ({ ...prev, drillStep: 'select_tag', search: '' }));
      } else if (cat === 'flow') {
        setMention(prev => ({ ...prev, drillStep: 'select_flow', search: '' }));
      } else if (cat === 'department') {
        setMention(prev => ({ ...prev, drillStep: 'select_department', search: '' }));
      }
      return;
    }
    if (mention.drillStep === 'select_pipeline') {
      setMention(prev => ({ ...prev, drillStep: 'select_column', selectedPipelineId: item.id, search: '' }));
      return;
    }
    if (mention.drillStep === 'select_column') {
      const pipeline = pipelines.find(p => p.id === mention.selectedPipelineId);
      insertMention(`/[Pipeline: ${pipeline?.name} > ${item.label}]`);
      return;
    }
    if (mention.drillStep === 'select_tag') {
      insertMention(`/[Tag: ${item.label}]`);
      return;
    }
    if (mention.drillStep === 'select_flow') {
      insertMention(`/[Fluxo: ${item.label}]`);
      return;
    }
    if (mention.drillStep === 'select_department') {
      insertMention(`/[Departamento: ${item.label}]`);
      return;
    }
  };

  const updateDropdownPosition = () => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const style = getComputedStyle(ta);
    const lineHeight = parseInt(style.lineHeight) || 20;
    const textBefore = value.slice(0, mention.triggerIndex);
    const lines = textBefore.split('\n');
    const currentLine = lines.length - 1;
    const top = ta.offsetTop + (currentLine + 1) * lineHeight - ta.scrollTop + 4;
    const left = ta.offsetLeft + 16;
    setDropdownPos({ top, left });
  };

  useEffect(() => {
    if (mention.active) updateDropdownPosition();
  }, [mention.active, mention.triggerIndex]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    const charBefore = newValue[cursorPos - 1];
    const charTwoBefore = cursorPos >= 2 ? newValue[cursorPos - 2] : ' ';
    const isWordStart = charTwoBefore === ' ' || charTwoBefore === '\n' || cursorPos === 1;

    if (charBefore === '@' && isWordStart) {
      setMention({ active: true, type: 'agent', triggerIndex: cursorPos - 1, search: '', drillStep: 'category' });
      return;
    }
    if (charBefore === '/' && isWordStart) {
      setMention({ active: true, type: 'function', triggerIndex: cursorPos - 1, search: '', drillStep: 'category' });
      return;
    }

    if (mention.active) {
      const searchText = newValue.slice(mention.triggerIndex + 1, cursorPos);
      if (searchText.includes(' ') && mention.drillStep === 'category') {
        closeMention();
      } else {
        setMention(prev => ({ ...prev, search: searchText }));
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!mention.active || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectItem(items[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMention();
    } else if (e.key === 'Backspace') {
      if (mention.search === '' && mention.drillStep !== 'category' && mention.type === 'function') {
        e.preventDefault();
        if (mention.drillStep === 'select_column') {
          setMention(prev => ({ ...prev, drillStep: 'select_pipeline', selectedPipelineId: undefined, search: '' }));
        } else {
          setMention(prev => ({ ...prev, drillStep: 'category', search: '' }));
        }
      }
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        closeMention();
      }
    }, 200);
  };

  const getBreadcrumb = () => {
    if (mention.type === 'agent') return 'Selecionar Agente';
    if (mention.drillStep === 'category') return 'Selecionar Função';
    if (mention.drillStep === 'select_pipeline') return 'Função > Pipeline';
    if (mention.drillStep === 'select_column') {
      const p = pipelines.find(p => p.id === mention.selectedPipelineId);
      return `Pipeline > ${p?.name || ''} > Coluna`;
    }
    if (mention.drillStep === 'select_tag') return 'Função > Tag';
    if (mention.drillStep === 'select_flow') return 'Função > Fluxo';
    if (mention.drillStep === 'select_department') return 'Função > Departamento';
    return '';
  };

  return (
    <div className="relative">
      {/* Simple textarea — no overlay, no ghost text */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[300px] font-mono resize-y text-foreground",
          className
        )}
      />

      {/* Dropdown menu — appears only when @ or / is typed */}
      {mention.active && items.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {getBreadcrumb()}
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {items.map((item, i) => (
              <button
                key={item.id}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                  i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <item.icon className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                {item.hasChildren && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </button>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-border">
            <span className="text-[10px] text-muted-foreground">↑↓ navegar · Enter selecionar · Esc fechar</span>
          </div>
        </div>
      )}
    </div>
  );
}
