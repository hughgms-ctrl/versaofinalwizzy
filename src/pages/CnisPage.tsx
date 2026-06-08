import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { analyzeCNIS, buildCnisReportHtml, buildCnisSummary, CnisAnalysis, CnisVinculo, parseCnisText } from "@/lib/cnis";
import { AlertCircle, ArrowLeft, Bot, CheckCircle2, Download, FileText, History, Loader2, Plus, RotateCcw, Square, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

type SessionStatus = "queued" | "starting" | "running" | "waiting_user" | "completed" | "failed" | "cancelled";

type CnisSession = {
  id: string;
  workspaceId?: string | null;
  runnerSessionId?: string;
  demo?: boolean;
  status: SessionStatus;
  nome: string;
  cpf: string;
  prisonDate: string;
  todayDate: string;
  source: "manual" | "runner";
  progressLabel: string;
  vinculos: CnisVinculo[];
  analysis: CnisAnalysis | null;
  reportHtml: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

type RunnerResult = {
  id?: string;
  nome?: string;
  cpf?: string;
  prisonDate?: string;
  todayDate?: string;
  vinculos?: CnisVinculo[];
  reportHtml?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RunnerSession = {
  id: string;
  status: SessionStatus;
  demo?: boolean;
  nome?: string;
  cpf?: string;
  prisonDate?: string;
  todayDate?: string;
  progressLabel?: string;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
  result?: RunnerResult | null;
};

const STORAGE_KEY = "wizzy:cnis:sessions:v1";
const RUNNER_BASE_URL = "http://localhost:8787";
const activeStatuses: SessionStatus[] = ["queued", "starting", "running", "waiting_user"];
const finalStatuses: SessionStatus[] = ["completed", "failed", "cancelled"];
const emptyForm = {
  nome: "",
  cpf: "",
  prisonDate: "",
  todayDate: new Date().toISOString().slice(0, 10),
  cnisText: "",
};

const statusLabels: Record<SessionStatus, string> = {
  queued: "Na fila",
  starting: "Iniciando",
  running: "Em andamento",
  waiting_user: "Aguardando",
  completed: "Concluida",
  failed: "Erro",
  cancelled: "Cancelada",
};

const statusClasses: Record<SessionStatus, string> = {
  queued: "bg-slate-100 text-slate-700 border-slate-200",
  starting: "bg-cyan-100 text-cyan-700 border-cyan-200",
  running: "bg-blue-100 text-blue-700 border-blue-200",
  waiting_user: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  cancelled: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export default function CnisPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { selectedWorkspaceId, selectedWorkspace, availableWorkspaces, setWorkspace, loading: loadingWorkspaces } = useWorkspaceContext();
  const [sessions, setSessions] = useState<CnisSession[]>(() => loadSessions());
  const [selectedId, setSelectedId] = useState<string | null>(() => loadSessions()[0]?.id || null);
  const [form, setForm] = useState(emptyForm);
  const visibleSessions = useMemo(
    () => selectedWorkspaceId ? sessions.filter((session) => !session.workspaceId || session.workspaceId === selectedWorkspaceId) : sessions,
    [selectedWorkspaceId, sessions],
  );
  const selected = visibleSessions.find((session) => session.id === selectedId) || null;
  const metrics = useMemo(() => {
    const active = visibleSessions.filter((session) => ["queued", "starting", "running", "waiting_user"].includes(session.status)).length;
    const completed = visibleSessions.filter((session) => session.status === "completed").length;
    const failed = visibleSessions.filter((session) => session.status === "failed").length;
    const qualified = visibleSessions.filter((session) => session.analysis?.direito).length;
    return { active, completed, failed, qualified };
  }, [visibleSessions]);

  const persistSessions = (next: CnisSession[]) => {
    setSessions(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    let stopped = false;

    const syncRunner = async () => {
      try {
        const response = await fetch(`${RUNNER_BASE_URL}/sessions`);
        const payload = await response.json();
        if (!response.ok || !payload?.ok || stopped) return;

        setSessions((prev) => {
          const runnerSessions: RunnerSession[] = payload.sessions || [];
          const selectedSession = selectedId ? prev.find((session) => session.id === selectedId) : null;
          let base = prev;

          if (selectedSession?.source === "runner" && !selectedSession.runnerSessionId) {
            const usedRunnerIds = new Set(prev.map((session) => session.runnerSessionId).filter(Boolean));
            const openRunner = runnerSessions
              .filter((runner) => !usedRunnerIds.has(runner.id) && activeStatuses.includes(runner.status))
              .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];

            if (openRunner) {
              base = prev.map((session) => session.id === selectedSession.id ? {
                ...session,
                runnerSessionId: openRunner.id,
                status: openRunner.status || "waiting_user",
                progressLabel: openRunner.progressLabel || "Consulta vinculada ao navegador que ja estava aberto.",
                errorMessage: undefined,
                updatedAt: new Date().toISOString(),
              } : session);
            }
          }

          const next = mergeRunnerSessions(base, runnerSessions, selectedWorkspaceId);
          if (next === prev) return prev;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      } catch {
        // The admin panel can keep working with manual simulations while the local runner is offline.
      }
    };

    syncRunner();
    const timer = window.setInterval(syncRunner, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [selectedWorkspaceId, selectedId]);

  const createManualSimulation = () => {
    const vinculos = parseCnisText(form.cnisText);
    if (!form.prisonDate) {
      toast({ title: "Informe a data da prisao", variant: "destructive" });
      return;
    }
    if (!vinculos.length) {
      toast({ title: "Nenhum vinculo identificado", description: "Cole linhas do CNIS com nome, tipo e datas no campo de importacao.", variant: "destructive" });
      return;
    }

    const analysis = analyzeCNIS(vinculos, form.prisonDate, { todayDate: form.todayDate });
    const reportHtml = buildCnisReportHtml({ nome: form.nome, cpf: form.cpf, prisonDate: form.prisonDate, todayDate: form.todayDate, analysis });
    const now = new Date().toISOString();
    const session: CnisSession = {
      id: crypto.randomUUID(),
      workspaceId: selectedWorkspaceId,
      status: "completed",
      nome: form.nome || "Sem nome",
      cpf: form.cpf,
      prisonDate: form.prisonDate,
      todayDate: form.todayDate,
      source: "manual",
      progressLabel: "Simulacao concluida por importacao manual.",
      vinculos,
      analysis,
      reportHtml,
      createdAt: now,
      updatedAt: now,
    };

    const next = [session, ...sessions].slice(0, 100);
    persistSessions(next);
    setSelectedId(session.id);
    setForm(emptyForm);
    toast({ title: "Simulacao CNIS concluida", description: analysis.direito ? "Direito indicado pelos criterios analisados." : "Direito nao indicado pelos criterios analisados." });
  };

  const createRunnerSession = async () => {
    const now = new Date().toISOString();
    const runningCount = sessions.filter((session) => session.status === "running").length;
    const queued = runningCount >= 3;
    let session: CnisSession = {
      id: crypto.randomUUID(),
      workspaceId: selectedWorkspaceId,
      status: queued ? "queued" : "waiting_user",
      nome: form.nome || "Nova consulta",
      cpf: form.cpf,
      prisonDate: form.prisonDate,
      todayDate: form.todayDate,
      source: "runner",
      progressLabel: queued
        ? "Consulta criada e aguardando vaga no runner local."
        : "Runner local ainda nao esta conectado. Esta sessao ficara pronta para automacao.",
      vinculos: [],
      analysis: null,
      reportHtml: "",
      createdAt: now,
      updatedAt: now,
    };

    try {
      const response = await fetch(`${RUNNER_BASE_URL}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: session.nome,
          cpf: session.cpf,
          prisonDate: session.prisonDate,
          todayDate: session.todayDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Runner local nao respondeu.");
      session = {
        ...session,
        runnerSessionId: payload.session.id,
        status: payload.session.status || "starting",
        progressLabel: payload.session.progressLabel || "Consulta enviada para o runner local.",
      };
      toast({ title: "Runner acionado", description: "O navegador controlado sera aberto pelo runner local." });
    } catch (error) {
      session = {
        ...session,
        status: "waiting_user",
        progressLabel: "Runner local nao conectado. Inicie tools/cnis-runner com npm start e abra esta sessao novamente.",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      toast({ title: "Runner local nao encontrado", description: "A sessao foi criada, mas o runner precisa estar rodando em localhost:8787.", variant: "destructive" });
    }

    const next = [session, ...sessions].slice(0, 100);
    persistSessions(next);
    setSelectedId(session.id);
  };

  const createDemoSession = async () => {
    const now = new Date().toISOString();
    let session: CnisSession = {
      id: crypto.randomUUID(),
      workspaceId: selectedWorkspaceId,
      demo: true,
      status: "starting",
      nome: form.nome || "Maria Demo Previdenciaria",
      cpf: form.cpf || "123.456.789-09",
      prisonDate: form.prisonDate || "2026-05-15",
      todayDate: form.todayDate,
      source: "runner",
      progressLabel: "Abrindo demo completa do runner CNIS.",
      vinculos: [],
      analysis: null,
      reportHtml: "",
      createdAt: now,
      updatedAt: now,
    };

    try {
      const response = await fetch(`${RUNNER_BASE_URL}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          demo: true,
          nome: session.nome,
          cpf: session.cpf,
          prisonDate: session.prisonDate,
          todayDate: session.todayDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Runner local nao respondeu.");
      session = {
        ...session,
        runnerSessionId: payload.session.id,
        status: payload.session.status || "starting",
        progressLabel: payload.session.progressLabel || "Demo enviada para o runner local.",
      };
      toast({ title: "Demo CNIS aberta", description: "A tela sera espelhada e o resultado entrara no historico automaticamente." });
    } catch (error) {
      session = {
        ...session,
        status: "failed",
        progressLabel: "Nao consegui conectar ao runner local para abrir a demo.",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      };
      toast({ title: "Runner local nao respondeu", description: "Inicie tools/cnis-runner com npm start e tente de novo.", variant: "destructive" });
    }

    const next = [session, ...sessions].slice(0, 100);
    persistSessions(next);
    setSelectedId(session.id);
  };

  const cancelSession = async (id: string) => {
    const target = sessions.find((session) => session.id === id);
    if (target?.runnerSessionId) {
      await fetch(`${RUNNER_BASE_URL}/sessions/${target.runnerSessionId}/cancel`, { method: "POST" }).catch(() => {});
    }
    const next = sessions.map((session) => session.id === id ? { ...session, status: "cancelled" as const, progressLabel: "Consulta cancelada pelo usuario.", updatedAt: new Date().toISOString() } : session);
    persistSessions(next);
  };

  const openRunnerForSession = async (id: string) => {
    const target = sessions.find((session) => session.id === id);
    if (!target) return;

    try {
      if (target.runnerSessionId) {
        const response = await fetch(`${RUNNER_BASE_URL}/sessions/${target.runnerSessionId}/show`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Nao consegui abrir a janela.");
        toast({ title: "Janela do runner aberta" });
        return;
      }

      const runnerResponse = await fetch(`${RUNNER_BASE_URL}/sessions`);
      const runnerPayload = await runnerResponse.json();
      if (runnerResponse.ok && runnerPayload?.ok) {
        const usedRunnerIds = new Set(sessions.map((session) => session.runnerSessionId).filter(Boolean));
        const openRunner = (runnerPayload.sessions || [])
          .filter((runner: RunnerSession) => !usedRunnerIds.has(runner.id) && activeStatuses.includes(runner.status))
          .sort((a: RunnerSession, b: RunnerSession) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];

        if (openRunner) {
          const next = sessions.map((session) => session.id === id ? {
            ...session,
            runnerSessionId: openRunner.id,
            status: openRunner.status || "waiting_user",
            nome: session.nome || openRunner.nome || "Consulta CNIS",
            cpf: session.cpf || openRunner.cpf || "",
            prisonDate: session.prisonDate || openRunner.prisonDate || "",
            todayDate: session.todayDate || openRunner.todayDate || new Date().toISOString().slice(0, 10),
            progressLabel: openRunner.progressLabel || "Consulta vinculada ao navegador que ja estava aberto.",
            errorMessage: undefined,
            updatedAt: new Date().toISOString(),
          } : session);
          persistSessions(next);
          const showResponse = await fetch(`${RUNNER_BASE_URL}/sessions/${openRunner.id}/show`, { method: "POST" });
          if (showResponse.ok) toast({ title: "Runner vinculado", description: "A aba aberta do INSS agora aparece nesta consulta." });
          return;
        }
      }

      const response = await fetch(`${RUNNER_BASE_URL}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: target.nome,
          cpf: target.cpf,
          prisonDate: target.prisonDate,
          todayDate: target.todayDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Runner local nao respondeu.");

      const next = sessions.map((session) => session.id === id ? {
        ...session,
        runnerSessionId: payload.session.id,
        status: payload.session.status || "starting",
        progressLabel: payload.session.progressLabel || "Consulta conectada ao runner local.",
        errorMessage: undefined,
        updatedAt: new Date().toISOString(),
      } : session);
      persistSessions(next);
      toast({ title: "Runner conectado", description: "A janela controlada sera aberta para esta consulta." });
    } catch (error) {
      const next = sessions.map((session) => session.id === id ? {
        ...session,
        status: "waiting_user" as const,
        progressLabel: "Runner local nao conectado. Inicie tools/cnis-runner com npm start e tente abrir novamente.",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      } : session);
      persistSessions(next);
      toast({ title: "Runner local nao respondeu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const downloadReport = (session: CnisSession) => {
    if (!session.reportHtml) return;
    const blob = new Blob([session.reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cnis-${session.cpf.replace(/\D/g, "") || session.id}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const clearHistory = () => {
    const next = selectedWorkspaceId ? sessions.filter((session) => session.workspaceId && session.workspaceId !== selectedWorkspaceId) : [];
    persistSessions(next);
    setSelectedId(null);
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/tools")} className="hidden gap-2 sm:flex">
              <ArrowLeft className="h-4 w-4" />
              Voltar para Wizzy
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/tools")} className="sm:hidden">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Voltar para Wizzy</span>
            </Button>
            <h1 className="shrink-0 text-lg font-semibold text-primary sm:text-xl">Wizzy CNIS</h1>
            <WorkspaceSelector
              loading={loadingWorkspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              selectedWorkspaceName={selectedWorkspace?.name}
              workspaces={availableWorkspaces}
              onChange={setWorkspace}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 lg:inline-flex">
              localhost:8787
            </Badge>
            <Button variant="outline" size="sm" onClick={createRunnerSession} className="gap-2">
              <Bot className="h-4 w-4" />
              Nova consulta
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b bg-card px-4 py-3">
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard label="Em andamento" value={metrics.active} />
              <MetricCard label="Concluidas" value={metrics.completed} />
              <MetricCard label="Qualificadas" value={metrics.qualified} />
              <MetricCard label="Com erro" value={metrics.failed} />
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[420px_minmax(0,1fr)]">
            <aside className="min-h-0 border-r bg-card">
              <Tabs defaultValue="new" className="flex h-full min-h-0 flex-col">
                <div className="border-b p-3">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="new" className="gap-2"><Plus className="h-4 w-4" /> Nova</TabsTrigger>
                    <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" /> Historico</TabsTrigger>
                  </TabsList>
                </div>

              <TabsContent value="new" className="m-0 min-h-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-4">
                    <div className="grid gap-3">
                      <Field label="Nome">
                        <Input value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} placeholder="Nome do segurado" />
                      </Field>
                      <Field label="CPF">
                        <Input value={form.cpf} onChange={(event) => setForm((prev) => ({ ...prev, cpf: event.target.value }))} placeholder="000.000.000-00" />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Data da prisao">
                          <Input type="date" value={form.prisonDate} onChange={(event) => setForm((prev) => ({ ...prev, prisonDate: event.target.value }))} />
                        </Field>
                        <Field label="Data base">
                          <Input type="date" value={form.todayDate} onChange={(event) => setForm((prev) => ({ ...prev, todayDate: event.target.value }))} />
                        </Field>
                      </div>
                      <Field label="Importacao manual do CNIS">
                        <Textarea
                          value={form.cnisText}
                          onChange={(event) => setForm((prev) => ({ ...prev, cnisText: event.target.value }))}
                          rows={10}
                          placeholder={"Cole aqui linhas com vinculo, tipo e datas.\nEx: EMPRESA X; Empregado; 01/01/2020; 31/12/2023"}
                          className="font-mono text-xs"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-2">
                      <Button onClick={createManualSimulation} className="gap-2">
                        <Upload className="h-4 w-4" />
                        Simular com dados importados
                      </Button>
                      <Button variant="outline" onClick={createRunnerSession} className="gap-2">
                        <Bot className="h-4 w-4" />
                        Nova consulta com runner
                      </Button>
                      <Button variant="secondary" onClick={createDemoSession} className="gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Demo completa
                      </Button>
                    </div>

                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      Com o runner local ligado em localhost:8787, a Wizzy abre o navegador controlado, injeta o painel CNIS e importa o resultado automaticamente para este historico.
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="m-0 min-h-0 flex-1 overflow-hidden">
                <div className="flex items-center justify-between border-b p-3">
                  <span className="text-sm font-medium">Consultas</span>
                  <Button variant="ghost" size="sm" onClick={clearHistory} disabled={!visibleSessions.length} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Limpar
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100%-49px)]">
                  <div className="space-y-2 p-3">
                    {visibleSessions.length ? visibleSessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedId(session.id)}
                        className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/60 ${selectedId === session.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{session.nome}</span>
                          <StatusBadge status={session.status} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{session.cpf || "Sem CPF"} - {formatDateTime(session.createdAt)}</p>
                      </button>
                    )) : (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Nenhuma consulta criada ainda.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              </Tabs>
            </aside>

            <main className="min-h-0 overflow-hidden">
              {selected ? (
                <SessionDetail
                  session={selected}
                  onDownload={() => downloadReport(selected)}
                  onCancel={() => cancelSession(selected.id)}
                  onOpenRunner={() => openRunnerForSession(selected.id)}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                  <div>
                    <FileText className="mx-auto mb-4 h-12 w-12 opacity-40" />
                    <p className="text-lg font-medium text-foreground">Crie ou selecione uma consulta CNIS</p>
                    <p className="mt-1 text-sm">O resultado da simulacao aparece aqui.</p>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
    </div>
  );
}

function WorkspaceSelector({
  loading,
  selectedWorkspaceId,
  selectedWorkspaceName,
  workspaces,
  onChange,
}: {
  loading: boolean;
  selectedWorkspaceId: string | null;
  selectedWorkspaceName?: string;
  workspaces: Array<{ id: string; name: string }>;
  onChange: (id: string | null) => void;
}) {
  return (
    <Select value={selectedWorkspaceId || "all"} onValueChange={(value) => onChange(value === "all" ? null : value)}>
      <SelectTrigger className="hidden h-9 w-[190px] sm:flex lg:w-[260px]" disabled={loading}>
        <SelectValue placeholder={loading ? "Carregando..." : selectedWorkspaceName || "Todos os workspaces"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os workspaces</SelectItem>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            {workspace.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-md">
      <CardContent className="flex items-center justify-between p-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <strong className="text-2xl">{value}</strong>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SessionDetail({
  session,
  onDownload,
  onCancel,
  onOpenRunner,
}: {
  session: CnisSession;
  onDownload: () => void;
  onCancel: () => void | Promise<void>;
  onOpenRunner: () => void | Promise<void>;
}) {
  const summary = session.analysis ? buildCnisSummary(session.analysis) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{session.nome}</h2>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-sm text-muted-foreground">{session.progressLabel}</p>
        </div>
        <div className="flex gap-2">
          {session.source === "runner" && (
            <Button variant="outline" size="sm" onClick={onOpenRunner} className="gap-2">
              <Bot className="h-4 w-4" />
              Abrir runner
            </Button>
          )}
          {session.reportHtml && (
            <Button variant="outline" size="sm" onClick={onDownload} className="gap-2">
              <Download className="h-4 w-4" />
              Baixar relatorio
            </Button>
          )}
          {["queued", "starting", "running", "waiting_user"].includes(session.status) && (
            <Button variant="outline" size="sm" onClick={onCancel} className="gap-2">
              <Square className="h-4 w-4" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {summary ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <ResultBox label="Resultado" value={summary.direito ? "Direito indicado" : "Direito nao indicado"} good={summary.direito} />
                <ResultBox label="Carencia" value={summary.carenciaExigida ? `${summary.competenciasCarencia}/${summary.carenciaNecessaria}` : "Dispensada"} good={summary.carenciaOk} />
                <ResultBox label="Qualidade" value={summary.mantemQualidade ? "Mantida" : "Perdida"} good={summary.mantemQualidade} />
                <ResultBox label="Retroativos" value={summary.retroactiveTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
              </div>

              <Card className="rounded-md">
                <CardHeader>
                  <CardTitle className="text-base">Vinculos identificados</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vinculo</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Inicio</TableHead>
                        <TableHead>Fim</TableHead>
                        <TableHead>Compet.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {session.vinculos.map((vinculo, index) => (
                        <TableRow key={`${vinculo.nome}-${index}`}>
                          <TableCell className="font-medium">{vinculo.nome}</TableCell>
                          <TableCell>{vinculo.tipo}</TableCell>
                          <TableCell>{vinculo.inicio}</TableCell>
                          <TableCell>{vinculo.fim}</TableCell>
                          <TableCell>{vinculo.competencias.length}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <RunnerViewport session={session} onOpenRunner={onOpenRunner} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function RunnerViewport({ session, onOpenRunner }: { session: CnisSession; onOpenRunner: () => void | Promise<void> }) {
  const [tick, setTick] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const hasRunner = Boolean(session.runnerSessionId);

  useEffect(() => {
    if (!hasRunner) return;
    setImageFailed(false);
    const timer = window.setInterval(() => setTick((value) => value + 1), 1200);
    return () => window.clearInterval(timer);
  }, [hasRunner, session.runnerSessionId]);

  const sendClick = async (event: MouseEvent<HTMLImageElement>) => {
    if (!session.runnerSessionId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    await fetch(`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/click`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        sourceWidth: rect.width,
        sourceHeight: rect.height,
      }),
    }).catch(() => {});
    setTick((value) => value + 1);
  };

  const sendKeyboard = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (!session.runnerSessionId) return;
    const specialKeys = new Set(["Backspace", "Delete", "Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const payload = specialKeys.has(event.key) ? { key: event.key } : event.key.length === 1 && !event.ctrlKey && !event.metaKey ? { text: event.key } : null;
    if (!payload) return;
    event.preventDefault();
    await fetch(`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/keyboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
    setTick((value) => value + 1);
  };

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-start gap-3">
          {hasRunner ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />}
          <div>
            <p className="font-medium">{hasRunner ? "Navegador CNIS espelhado" : "Sessao pronta para automacao"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasRunner
                ? "Clique na imagem e digite para controlar a janela do runner. A janela externa continua sendo o navegador real."
                : "Clique em Abrir runner para criar a janela controlada e mostrar a pagina aqui dentro."}
            </p>
          </div>
        </div>
        {!hasRunner && (
          <Button variant="outline" size="sm" onClick={onOpenRunner} className="gap-2">
            <Bot className="h-4 w-4" />
            Conectar runner
          </Button>
        )}
      </div>

      <div
        tabIndex={0}
        onKeyDown={sendKeyboard}
        className="flex min-h-0 flex-1 items-center justify-center bg-black/30 p-3 outline-none focus:ring-2 focus:ring-primary"
      >
        {hasRunner && !imageFailed ? (
          <img
            src={`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/screenshot?t=${tick}`}
            alt="Navegador controlado pelo runner CNIS"
            onClick={sendClick}
            onError={() => setImageFailed(true)}
            className="max-h-full w-full max-w-full cursor-crosshair rounded-sm object-contain shadow-sm"
            draggable={false}
          />
        ) : (
          <div className="max-w-md text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-4 h-12 w-12 opacity-40" />
            <p className="font-medium text-foreground">{imageFailed ? "Ainda nao consegui receber a tela do runner." : "Nenhuma janela conectada ainda."}</p>
            <p className="mt-2">
              {imageFailed ? "Use Abrir runner para trazer a janela para frente ou crie uma nova consulta." : "A visualizacao aparece aqui quando o runner abrir o Chromium controlado."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBox({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <Card className="rounded-md">
      <CardContent className="flex items-center gap-3 p-4">
        {good === undefined ? <FileText className="h-5 w-5 text-muted-foreground" /> : good ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-rose-600" />}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  return <Badge variant="outline" className={statusClasses[status]}>{statusLabels[status]}</Badge>;
}

function mergeRunnerSessions(current: CnisSession[], runnerSessions: RunnerSession[], workspaceId?: string | null): CnisSession[] {
  let changed = false;
  const runnerById = new Map(runnerSessions.map((session) => [session.id, session]));
  const knownRunnerIds = new Set(current.map((session) => session.runnerSessionId).filter(Boolean));

  const next = current.map((session) => {
    if (!session.runnerSessionId) return session;
    const runner = runnerById.get(session.runnerSessionId);
    if (!runner) return session;

    const base: CnisSession = {
      ...session,
      status: runner.status || session.status,
      progressLabel: runner.progressLabel || session.progressLabel,
      errorMessage: runner.errorMessage || session.errorMessage,
      updatedAt: new Date().toISOString(),
    };

    if (runner.result?.vinculos?.length) {
      const nome = runner.result.nome || runner.nome || session.nome;
      const cpf = runner.result.cpf || runner.cpf || session.cpf;
      const prisonDate = runner.result.prisonDate || runner.prisonDate || session.prisonDate;
      const todayDate = runner.result.todayDate || runner.todayDate || session.todayDate;
      const vinculos = reviveVinculos(runner.result.vinculos);
      const analysis = prisonDate ? analyzeCNIS(vinculos, prisonDate, { todayDate }) : null;
      const reportHtml = runner.result.reportHtml || (analysis ? buildCnisReportHtml({ nome, cpf, prisonDate, todayDate, analysis }) : session.reportHtml);

      changed = true;
      return {
        ...base,
        status: "completed" as const,
        nome,
        cpf,
        prisonDate,
        todayDate,
        vinculos,
        analysis,
        reportHtml,
        progressLabel: runner.progressLabel || "Consulta concluida e importada para a Wizzy.",
        updatedAt: runner.result.updatedAt || base.updatedAt,
      };
    }

    const hasStatusChange = base.status !== session.status
      || base.progressLabel !== session.progressLabel
      || base.errorMessage !== session.errorMessage;

    if (!hasStatusChange) return session;
    changed = true;
    return base;
  });

  const discovered = runnerSessions
    .filter((runner) => !knownRunnerIds.has(runner.id) && (activeStatuses.includes(runner.status) || Boolean(runner.result?.vinculos?.length)))
    .map((runner) => {
      const result = runner.result || null;
      const nome = result?.nome || runner.nome || "Consulta CNIS";
      const cpf = result?.cpf || runner.cpf || "";
      const prisonDate = result?.prisonDate || runner.prisonDate || "";
      const todayDate = result?.todayDate || runner.todayDate || new Date().toISOString().slice(0, 10);
      const vinculos = result?.vinculos?.length ? reviveVinculos(result.vinculos) : [];
      const analysis = vinculos.length && prisonDate ? analyzeCNIS(vinculos, prisonDate, { todayDate }) : null;
      const reportHtml = result?.reportHtml || (analysis ? buildCnisReportHtml({ nome, cpf, prisonDate, todayDate, analysis }) : "");

      return {
        id: crypto.randomUUID(),
        workspaceId,
        runnerSessionId: runner.id,
        demo: runner.demo,
        status: result?.vinculos?.length ? "completed" as const : runner.status || "waiting_user",
        nome,
        cpf,
        prisonDate,
        todayDate,
        source: "runner" as const,
        progressLabel: runner.progressLabel || "Consulta aberta no runner local.",
        vinculos,
        analysis,
        reportHtml,
        createdAt: result?.createdAt || runner.createdAt || new Date().toISOString(),
        updatedAt: result?.updatedAt || runner.updatedAt || new Date().toISOString(),
        errorMessage: runner.errorMessage,
      };
    });

  if (discovered.length) {
    changed = true;
    return [...discovered, ...next].slice(0, 100);
  }

  return changed ? next : current;
}

function reviveVinculos(vinculos: CnisVinculo[]): CnisVinculo[] {
  return (vinculos || []).map((vinculo) => ({
    ...vinculo,
    inicioDate: new Date(vinculo.inicioDate),
    fimDate: new Date(vinculo.fimDate),
  }));
}

function loadSessions(): CnisSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(reviveSession) : [];
  } catch {
    return [];
  }
}

function reviveSession(session: CnisSession): CnisSession {
  const vinculos = reviveVinculos(session.vinculos || []);
  const analysis = vinculos.length && session.prisonDate
    ? analyzeCNIS(vinculos, session.prisonDate, { todayDate: session.todayDate })
    : null;
  return {
    ...session,
    vinculos,
    analysis,
    reportHtml: session.reportHtml || (analysis ? buildCnisReportHtml({
      nome: session.nome,
      cpf: session.cpf,
      prisonDate: session.prisonDate,
      todayDate: session.todayDate,
      analysis,
    }) : ""),
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
