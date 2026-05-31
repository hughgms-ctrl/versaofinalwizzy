import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { Search, X } from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";

interface TaskFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  priorityFilter: string;
  onPriorityChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  dueDateFilter: string;
  onDueDateChange: (value: string) => void;
  setorFilter?: string;
  onSetorChange?: (value: string) => void;
  projectFilter?: string;
  onProjectChange?: (value: string) => void;
  projects?: Array<{ id: string; name: string }>;
  setores?: Array<{ id: string; name: string }>;
  typeFilter?: string;
  onTypeChange?: (value: string) => void;
  onClearAll?: () => void;
}

export const TaskFilters = ({
  searchTerm,
  onSearchChange,
  priorityFilter,
  onPriorityChange,
  statusFilter,
  onStatusChange,
  dueDateFilter,
  onDueDateChange,
  setorFilter,
  onSetorChange,
  projectFilter,
  onProjectChange,
  projects,
  setores,
  typeFilter,
  onTypeChange,
  onClearAll,
}: TaskFiltersProps) => {
  const hasActiveFilters = 
    searchTerm !== "" ||
    priorityFilter !== "all" ||
    statusFilter !== "all" ||
    dueDateFilter !== "all" ||
    (projectFilter && projectFilter !== "all") ||
    (typeFilter && typeFilter !== "all") ||
    (setorFilter && setorFilter !== "all");

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-muted-foreground">Filtros</h3>
        {hasActiveFilters && onClearAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 text-xs gap-1"
          >
            <X className="h-3 w-3" />
            Limpar Filtros
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="search">Buscar</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            placeholder="Buscar por título ou descrição..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {typeFilter !== undefined && onTypeChange && (
          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <Select value={typeFilter} onValueChange={onTypeChange}>
              <SelectTrigger id="type">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="project">Projeto</SelectItem>
                <SelectItem value="folder">Sem Projeto</SelectItem>
                <SelectItem value="personal">Pessoal</SelectItem>
                <SelectItem value="routine">Rotina</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {projectFilter !== undefined && onProjectChange && (
          <div className="space-y-2">
            <Label htmlFor="project">Projeto</Label>
            <Select value={projectFilter} onValueChange={onProjectChange}>
              <SelectTrigger id="project">
                <SelectValue placeholder="Todos os projetos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {setorFilter !== undefined && onSetorChange && (
          <div className="space-y-2">
            <Label htmlFor="setor">Setor</Label>
            <Select value={setorFilter} onValueChange={onSetorChange}>
              <SelectTrigger id="setor">
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os setores</SelectItem>
                {setores?.map((setor) => (
                  <SelectItem key={setor.id} value={setor.id}>
                    {setor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="priority">Prioridade</Label>
          <Select value={priorityFilter} onValueChange={onPriorityChange}>
            <SelectTrigger id="priority">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger id="status">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="todo">A fazer</SelectItem>
              <SelectItem value="in_progress">Fazendo</SelectItem>
              <SelectItem value="completed">Feito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dueDate">Vencimento</Label>
          <Select value={dueDateFilter} onValueChange={onDueDateChange}>
            <SelectTrigger id="dueDate">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="overdue">Atrasadas</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Esta Semana</SelectItem>
              <SelectItem value="month">Este Mês</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
