import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/fluzz/components/ui/sheet";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import { Separator } from "@/fluzz/components/ui/separator";
import { toast } from "sonner";
import { Plus, FileText, Trash2, ChevronRight, Pencil, Target, Users, Package, ListOrdered, Clock, AlertCircle } from "lucide-react";

interface Process {
  id: string;
  area: string;
  title: string;
  content: string;
  objective?: string | null;
  responsible?: string | null;
  approver?: string | null;
  materials?: string | null;
  steps?: string | null;
  frequency?: string | null;
  observations?: string | null;
  created_at: string;
  created_by: string | null;
  workspace_id: string | null;
}

interface Step {
  id: string;
  content: string;
}

export default function Processes() {
  const { workspace, permissions, isAdmin, isGestor } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const processRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [highlightedProcess, setHighlightedProcess] = useState<string | null>(null);

  const canViewProcesses = isAdmin || isGestor || permissions.can_view_processes;

  // Redirect if user doesn't have permission to view processes
  useEffect(() => {
    if (workspace && !canViewProcesses) {
      toast.error("Você não tem permissão para acessar esta página");
      navigate("/tools/wizzy-flow/");
    }
  }, [workspace, canViewProcesses, navigate]);

  const { data: processes, isLoading } = useQuery({
    queryKey: ["process-documentation", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("process_documentation")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("area")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Process[];
    },
    enabled: !!workspace,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("process_documentation").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-documentation"] });
      toast.success("POP excluído!");
      setSelectedProcess(null);
    },
  });

  const areas = Array.from(new Set(processes?.map((p) => p.area) || []));
  const filteredProcesses = selectedArea ? processes?.filter((p) => p.area === selectedArea) : processes;

  // Handle processId from URL
  useEffect(() => {
    const processId = searchParams.get("processId");
    if (processId && processes) {
      const process = processes.find(p => p.id === processId);
      if (process) {
        setSelectedProcess(process);
        setHighlightedProcess(processId);
        const timer = setTimeout(() => {
          setHighlightedProcess(null);
          setSearchParams({});
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [processes, searchParams, setSearchParams]);

  // Parse steps from JSON
  const parseSteps = (stepsJson: string | null | undefined): Step[] => {
    if (!stepsJson) return [];
    try {
      const parsed = JSON.parse(stepsJson);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      // If it's not JSON, treat as single step
      return [{ id: '1', content: stepsJson }];
    }
  };

  // Parse materials from newline-separated string
  const parseMaterials = (materials: string | null | undefined): string[] => {
    if (!materials) return [];
    return materials.split('\n').filter(m => m.trim());
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6 px-2 md:px-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">POP's</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Procedimentos Operacionais Padrão organizados por setor
            </p>
          </div>
          <Button onClick={() => navigate("/tools/wizzy-flow/workspace/processes/new")} className="gap-2 w-full sm:w-auto">
            <Plus size={20} />
            Novo POP
          </Button>
        </div>

        <div className="w-full sm:w-64">
          <Select value={selectedArea || "all"} onValueChange={(val) => setSelectedArea(val === "all" ? null : val)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Filtrar por setor" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Todos os Setores</SelectItem>
              {areas.map((areaName) => (
                <SelectItem key={areaName} value={areaName}>
                  {areaName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredProcesses && filteredProcesses.length > 0 ? (
          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProcesses.map((process) => (
              <Card
                key={process.id}
                ref={(el) => (processRefs.current[process.id] = el)}
                onClick={() => setSelectedProcess(process)}
                className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50 ${
                  highlightedProcess === process.id ? "ring-2 ring-primary shadow-lg" : ""
                }`}
              >
                <CardHeader className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-1 font-medium">{process.area}</div>
                      <CardTitle className="text-sm md:text-base line-clamp-2">{process.title}</CardTitle>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 md:py-16 px-4">
              <div className="text-center">
                <FileText className="mx-auto h-10 w-10 md:h-12 md:w-12 text-muted-foreground mb-4" />
                <p className="text-sm md:text-base text-muted-foreground mb-4">
                  {selectedArea ? `Nenhum POP neste setor ainda` : `Nenhum POP cadastrado ainda`}
                </p>
                <Button onClick={() => navigate("/tools/wizzy-flow/workspace/processes/new")} className="gap-2 w-full sm:w-auto">
                  <Plus size={20} />
                  Criar Primeiro POP
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Process Detail Sheet - Document View */}
      <Sheet open={!!selectedProcess} onOpenChange={(open) => {
        if (!open) {
          setSelectedProcess(null);
        }
      }}>
        <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="p-4 md:p-6 border-b shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-primary font-medium mb-1">{selectedProcess?.area}</div>
                <SheetTitle className="text-lg md:text-xl text-left">{selectedProcess?.title}</SheetTitle>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedProcess) {
                      setSelectedProcess(null);
                      navigate(`/tools/wizzy-flow/workspace/processes/${selectedProcess.id}/edit`);
                    }
                  }}
                >
                  <Pencil size={18} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedProcess) deleteMutation.mutate(selectedProcess.id);
                  }}
                >
                  <Trash2 size={18} />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 md:p-6 space-y-6">
              {/* Objective Section */}
              {selectedProcess?.objective && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Target size={16} className="text-primary" />
                    Objetivo
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {selectedProcess.objective}
                  </p>
                </div>
              )}

              {/* Responsibles Section */}
              {(selectedProcess?.responsible || selectedProcess?.approver) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Users size={16} className="text-primary" />
                    Responsáveis
                  </div>
                  <div className="pl-6 space-y-1">
                    {selectedProcess?.responsible && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Executor:</span>{" "}
                        <span className="text-foreground">{selectedProcess.responsible}</span>
                      </p>
                    )}
                    {selectedProcess?.approver && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Aprovador:</span>{" "}
                        <span className="text-foreground">{selectedProcess.approver}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Materials Section */}
              {selectedProcess?.materials && parseMaterials(selectedProcess.materials).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Package size={16} className="text-primary" />
                    Materiais Necessários
                  </div>
                  <ul className="pl-6 space-y-1">
                    {parseMaterials(selectedProcess.materials).map((material, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-1.5">•</span>
                        {material}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Steps Section */}
              {selectedProcess?.steps && parseSteps(selectedProcess.steps).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ListOrdered size={16} className="text-primary" />
                    Passo a Passo
                  </div>
                  <div className="pl-6 space-y-4">
                    {parseSteps(selectedProcess.steps).map((step, index) => {
                      const textContent = step.content.replace(/<[^>]*>/g, '').trim();
                      const mediaContent = step.content.match(/(<img[^>]*>|<iframe[^>]*><\/iframe>|<a[^>]*>[^<]*<\/a>)/g)?.join('') || '';
                      
                      return (
                        <div key={step.id} className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                            {index + 1}
                          </div>
                          <div className="flex-1 space-y-2">
                            <p className="text-sm text-foreground">{textContent}</p>
                            {mediaContent && (
                              <div 
                                className="prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: mediaContent }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Frequency Section */}
              {selectedProcess?.frequency && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Clock size={16} className="text-primary" />
                    Frequência
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {selectedProcess.frequency}
                  </p>
                </div>
              )}

              {/* Observations Section */}
              {selectedProcess?.observations && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <AlertCircle size={16} className="text-primary" />
                    Observações
                  </div>
                  <div className="pl-6 p-3 bg-muted/50 rounded-lg border">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedProcess.observations}
                    </p>
                  </div>
                </div>
              )}

              {/* Legacy content fallback - only show if no structured data */}
              {!selectedProcess?.objective && 
               !selectedProcess?.responsible && 
               !selectedProcess?.materials && 
               !selectedProcess?.steps &&
               !selectedProcess?.frequency &&
               !selectedProcess?.observations &&
               selectedProcess?.content && (
                <article
                  className="prose prose-sm md:prose max-w-none dark:prose-invert break-words"
                  dangerouslySetInnerHTML={{ __html: selectedProcess.content }}
                />
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
