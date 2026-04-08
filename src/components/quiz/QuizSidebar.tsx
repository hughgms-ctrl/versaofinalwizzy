import { useState } from 'react';
import {
  Type, AlignLeft, Hash, Phone, Mail, Calendar, Clock,
  CircleDot, ListChecks, ChevronDown as DropdownIcon, ToggleLeft, Star, ImageIcon, MousePointerClick,
  MessageSquare, Video, Image, Link2, Headphones,
  Variable, GitBranch, Code2, Timer, Shuffle, Webhook, ArrowRight, CornerDownLeft,
  Facebook, BarChart3,
  ChevronDown, ChevronRight, PanelLeftClose, PanelLeft, GripVertical, Search, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type QuizNodeType =
  | 'quiz-start'
  // Bubbles
  | 'quiz-bubble-text' | 'quiz-bubble-image' | 'quiz-bubble-video' | 'quiz-bubble-embed' | 'quiz-bubble-audio'
  // Inputs
  | 'quiz-input-text' | 'quiz-input-number' | 'quiz-input-email' | 'quiz-input-website'
  | 'quiz-input-date' | 'quiz-input-time' | 'quiz-input-phone' | 'quiz-input-buttons'
  | 'quiz-input-pic-choice' | 'quiz-input-rating' | 'quiz-input-file'
  // Logic
  | 'quiz-logic-condition' | 'quiz-logic-redirect' | 'quiz-logic-wait'
  | 'quiz-logic-ab-test' | 'quiz-logic-jump'
  // Events
  | 'quiz-event-pixel';

interface QuizComponent {
  type: QuizNodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface QuizCategory {
  id: string;
  label: string;
  color: string;
  components: QuizComponent[];
}

export const quizCategories: QuizCategory[] = [
  {
    id: 'bubbles',
    label: 'Bubbles',
    color: 'text-blue-500',
    components: [
      { type: 'quiz-bubble-text', label: 'Texto', icon: MessageSquare, color: 'bg-blue-500' },
      { type: 'quiz-bubble-image', label: 'Imagem', icon: ImageIcon, color: 'bg-blue-500' },
      { type: 'quiz-bubble-video', label: 'Vídeo', icon: Video, color: 'bg-blue-500' },
      { type: 'quiz-bubble-embed', label: 'Embed', icon: Code2, color: 'bg-blue-500' },
      { type: 'quiz-bubble-audio', label: 'Áudio', icon: Headphones, color: 'bg-blue-500' },
    ],
  },
  {
    id: 'inputs',
    label: 'Inputs',
    color: 'text-orange-500',
    components: [
      { type: 'quiz-input-text', label: 'Text', icon: Type, color: 'bg-orange-500' },
      { type: 'quiz-input-number', label: 'Number', icon: Hash, color: 'bg-orange-500' },
      { type: 'quiz-input-email', label: 'Email', icon: Mail, color: 'bg-orange-500' },
      { type: 'quiz-input-website', label: 'Website', icon: Globe, color: 'bg-orange-500' },
      { type: 'quiz-input-date', label: 'Date', icon: Calendar, color: 'bg-orange-500' },
      { type: 'quiz-input-time', label: 'Time', icon: Clock, color: 'bg-orange-500' },
      { type: 'quiz-input-phone', label: 'Phone', icon: Phone, color: 'bg-orange-500' },
      { type: 'quiz-input-buttons', label: 'Buttons', icon: MousePointerClick, color: 'bg-orange-500' },
      { type: 'quiz-input-pic-choice', label: 'Pic choice', icon: ImageIcon, color: 'bg-orange-500' },
      { type: 'quiz-input-rating', label: 'Rating', icon: Star, color: 'bg-orange-500' },
      { type: 'quiz-input-file', label: 'File', icon: Link2, color: 'bg-orange-500' },
    ],
  },
  {
    id: 'logic',
    label: 'Logic',
    color: 'text-purple-500',
    components: [
      { type: 'quiz-logic-condition', label: 'Condition', icon: GitBranch, color: 'bg-purple-500' },
      { type: 'quiz-logic-redirect', label: 'Redirect', icon: ArrowRight, color: 'bg-purple-500' },
      { type: 'quiz-logic-wait', label: 'Wait', icon: Timer, color: 'bg-purple-500' },
      { type: 'quiz-logic-ab-test', label: 'AB Test', icon: Shuffle, color: 'bg-purple-500' },
      { type: 'quiz-logic-jump', label: 'Jump', icon: CornerDownLeft, color: 'bg-purple-500' },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    color: 'text-green-500',
    components: [
      { type: 'quiz-event-pixel', label: 'Pixel', icon: BarChart3, color: 'bg-green-500' },
    ],
  },
];

const allComponents = quizCategories.flatMap(c => c.components);

interface QuizSidebarProps {
  onDragStart: (event: React.DragEvent, nodeType: QuizNodeType, label: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function QuizSidebar({ onDragStart, isCollapsed, onToggleCollapse }: QuizSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['bubbles', 'inputs', 'logic', 'events']);
  const [search, setSearch] = useState('');

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (isCollapsed) {
    return (
      <div className="w-12 bg-card border-r border-border h-full flex flex-col items-center py-3">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="mb-4">
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const filtered = search
    ? quizCategories.map(cat => ({
        ...cat,
        components: cat.components.filter(c => c.label.toLowerCase().includes(search.toLowerCase())),
      })).filter(cat => cat.components.length > 0)
    : quizCategories;

  return (
    <div className="w-72 bg-card border-r border-border h-full overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 flex-shrink-0">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        {filtered.map((category) => {
          const isExpanded = expandedCategories.includes(category.id);
          return (
            <div key={category.id}>
              <button
                onClick={() => toggleCategory(category.id)}
                className="flex items-center gap-2 mb-1.5 w-full text-left"
              >
                <span className={cn("text-xs font-bold uppercase tracking-wider", category.color)}>
                  {category.label}
                </span>
                {isExpanded
                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                }
              </button>
              {isExpanded && (
                <div className="grid grid-cols-2 gap-1.5">
                  {category.components.map((comp) => {
                    const Icon = comp.icon;
                    return (
                      <div
                        key={comp.type}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/quizflow', comp.type);
                          e.dataTransfer.setData('application/quizflow-label', comp.label);
                          e.dataTransfer.effectAllowed = 'move';
                          onDragStart(e, comp.type, comp.label);
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border border-border hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all text-sm"
                      >
                        <Icon className={cn("h-4 w-4 flex-shrink-0", category.color)} />
                        <span className="truncate text-foreground">{comp.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function getQuizComponentInfo(type: string) {
  return allComponents.find(c => c.type === type);
}
