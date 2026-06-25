import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { analyzeCNIS, buildCnisReportHtml, buildCnisSummary, CnisAnalysis, CnisBenefitType, CnisVinculo } from "@/lib/cnis";
import { AlertCircle, ArrowLeft, Bot, CheckCircle2, Download, FileText, History, Loader2, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
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
  benefitType: CnisBenefitType;
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
  benefitType?: CnisBenefitType;
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
  benefitType?: CnisBenefitType;
  progressLabel?: string;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
  result?: RunnerResult | null;
};

const STORAGE_KEY = "wizzy:cnis:sessions:v1";
const RUNNER_BASE_URL = import.meta.env.VITE_CNIS_RUNNER_URL || "http://127.0.0.1:8787";
const RUNNER_PROTOCOL_URL = import.meta.env.VITE_CNIS_RUNNER_PROTOCOL_URL || "wizzy-cnis-runner://";
const RUNNER_INSTALLER_WINDOWS_URL = import.meta.env.VITE_CNIS_RUNNER_WINDOWS_INSTALLER_URL || "/downloads/wizzy-prev-runner-win.exe";
const RUNNER_INSTALLER_MACOS_URL = import.meta.env.VITE_CNIS_RUNNER_MACOS_INSTALLER_URL || "";
const RUNNER_INSTALLER_GENERIC_URL = import.meta.env.VITE_CNIS_RUNNER_INSTALLER_URL || "";
const activeStatuses: SessionStatus[] = ["queued", "starting", "running", "waiting_user"];
const finalStatuses: SessionStatus[] = ["completed", "failed", "cancelled"];
const emptyForm = {
  cpf: "",
  prisonDate: "",
  todayDate: new Date().toISOString().slice(0, 10),
  batchText: "",
  benefitType: "auxilio_reclusao" as CnisBenefitType,
};

type ConfirmAction =
  | { type: "clear" }
  | { type: "delete"; sessionId: string };

const benefitLabels: Record<CnisBenefitType, string> = {
  auxilio_reclusao: "Auxilio-reclusao",
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

function isLocalRunnerEnvironment() {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_ENABLE_CNIS_RUNNER === "false") return false;
  return true;
}

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
  const localRunnerEnabled = useMemo(() => isLocalRunnerEnvironment(), []);
  const [sessions, setSessions] = useState<CnisSession[]>(() => loadSessions());
  const [selectedId, setSelectedId] = useState<string | null>(() => loadSessions()[0]?.id || null);
  const [form, setForm] = useState(emptyForm);
  const [runnerInstallMessage, setRunnerInstallMessage] = useState<string | null>(null);
  const [runnerCheckLabel, setRunnerCheckLabel] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const visibleSessions = useMemo(
    () => {
      if (!selectedWorkspaceId) return sessions;
      if (selectedWorkspaceId === 'unassigned') {
        return sessions.filter((session) => !session.workspaceId);
      }
      return sessions.filter((session) => !session.workspaceId || session.workspaceId === selectedWorkspaceId);
    },
    [selectedWorkspaceId, sessions],
  );
  const selected = visibleSessions.find((session) => session.id === selectedId) || null;
  const runnerChecking = Boolean(runnerCheckLabel);
  const runnerDownloadLabel = getRunnerDownloadLabel();
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

  const checkRunnerAvailable = async (action: "certificate-login" | "open-runner", label: string) => {
    setRunnerInstallMessage(null);
    setRunnerCheckLabel(label);
    try {
      await ensureRunnerAvailable(action);
    } finally {
      setRunnerCheckLabel(null);
    }
  };

  useEffect(() => {
    if (!localRunnerEnabled) return;

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
  }, [localRunnerEnabled, selectedWorkspaceId, selectedId]);

  const createRunnerSession = async () => {
    if (runnerChecking) return;

    if (!localRunnerEnabled) {
      toast({
        title: "Runner Wizzy Prev desativado",
        description: "Ative o runner no ambiente para abrir o navegador controlado.",
        variant: "destructive",
      });
      return;
    }

    let inputs: Array<{ cpf: string; prisonDate: string }>;
    try {
      inputs = parseRunnerInputs(form.cpf, form.prisonDate, form.batchText);
    } catch (error) {
      toast({ title: "Dados incompletos", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return;
    }

    const activeCount = sessions.filter((session) => activeStatuses.includes(session.status)).length;
    if (inputs.length > 5 || activeCount + inputs.length > 5) {
      toast({
        title: "Limite de 5 consultas",
        description: "O runner local processa no maximo 5 consultas ao mesmo tempo. Finalize ou apague consultas em andamento antes de adicionar mais.",
        variant: "destructive",
      });
      return;
    }

    try {
      await checkRunnerAvailable("open-runner", "Verificando se o runner local esta ativo para iniciar a consulta.");
    } catch (error) {
      setRunnerInstallMessage(getRunnerInstallMessage());
      toast({
        title: "Runner local nao respondeu",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    const created: CnisSession[] = [];

    try {
      for (const input of inputs) {
        let session: CnisSession = {
          id: crypto.randomUUID(),
          workspaceId: selectedWorkspaceId,
          status: "starting",
          nome: "",
          cpf: input.cpf,
          prisonDate: input.prisonDate,
          todayDate: form.todayDate,
          benefitType: "auxilio_reclusao",
          source: "runner",
          progressLabel: "Enviando consulta para o runner local.",
          vinculos: [],
          analysis: null,
          reportHtml: "",
          createdAt: now,
          updatedAt: now,
        };

        const response = await fetch(`${RUNNER_BASE_URL}/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nome: "",
            cpf: session.cpf,
            prisonDate: session.prisonDate,
            todayDate: session.todayDate,
            benefitType: "auxilio_reclusao",
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
        created.push(session);
      }
    } catch (error) {
      toast({
        title: "Nao consegui criar a consulta",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      return;
    }

    const next = [...created, ...sessions].slice(0, 100);
    persistSessions(next);
    setSelectedId(created[0]?.id || selectedId);
    setForm((prev) => ({ ...prev, cpf: "", prisonDate: "", batchText: "" }));
    toast({ title: "Runner acionado", description: `${created.length} consulta${created.length > 1 ? "s" : ""} enviada${created.length > 1 ? "s" : ""}.` });
  };

  const createDemoSession = async () => {
    if (!localRunnerEnabled) {
      toast({
        title: "Runner Wizzy Prev desativado",
        description: "Ative o runner no ambiente para abrir a demo controlada.",
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    let session: CnisSession = {
      id: crypto.randomUUID(),
      workspaceId: selectedWorkspaceId,
      demo: true,
      status: "starting",
      nome: "Consulta demo",
      cpf: form.cpf || "123.456.789-09",
      prisonDate: form.prisonDate || "2026-05-15",
      todayDate: form.todayDate,
      benefitType: "auxilio_reclusao",
      source: "runner",
      progressLabel: "Abrindo demo completa do runner Wizzy Prev.",
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
      toast({ title: "Demo Wizzy Prev aberta", description: "A tela sera espelhada e o resultado entrara no historico automaticamente." });
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
    if (localRunnerEnabled && target?.runnerSessionId) {
      await fetch(`${RUNNER_BASE_URL}/sessions/${target.runnerSessionId}/cancel`, { method: "POST" }).catch(() => {});
    }
    const next = sessions.map((session) => session.id === id ? { ...session, status: "cancelled" as const, progressLabel: "Consulta cancelada pelo usuario.", updatedAt: new Date().toISOString() } : session);
    persistSessions(next);
  };

  const openRunnerForSession = async (id: string) => {
    if (runnerChecking) return;

    if (!localRunnerEnabled) {
      toast({
        title: "Runner Wizzy Prev desativado",
        description: "Ative o runner no ambiente para abrir o navegador controlado.",
        variant: "destructive",
      });
      return;
    }

    const target = sessions.find((session) => session.id === id);
    if (!target) return;

    try {
      await checkRunnerAvailable("open-runner", "Verificando se o runner local esta ativo para abrir a janela.");
      if (target.runnerSessionId) {
        const response = await fetch(`${RUNNER_BASE_URL}/sessions/${target.runnerSessionId}/show`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Nao consegui abrir a janela.");
        await fetch(`${RUNNER_BASE_URL}/sessions/${target.runnerSessionId}/inject`, { method: "POST" }).catch(() => {});
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
      setRunnerInstallMessage(getRunnerInstallMessage());
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

  const openCertificateLogin = async () => {
    if (runnerChecking) return;

    if (!localRunnerEnabled) {
      toast({
        title: "Runner Wizzy Prev desativado",
        description: "Ative o runner local para abrir o login com certificado.",
        variant: "destructive",
      });
      return;
    }

    try {
      await checkRunnerAvailable("certificate-login", "Verificando se o runner local esta ativo para abrir o login.");
      const response = await fetch(`${RUNNER_BASE_URL}/auth/certificate-login`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Nao consegui abrir o Chromium para login.");
      const next = sessions.map((session) => session.source === "runner" && activeStatuses.includes(session.status) ? {
        ...session,
        status: "waiting_user" as const,
        progressLabel: "Faca o login com certificado digital no Chromium visivel. Depois clique em Concluir login.",
        updatedAt: new Date().toISOString(),
      } : session);
      persistSessions(next);
      toast({ title: "Chromium visivel aberto", description: "Selecione o certificado digital e conclua o login no GERID." });
    } catch (error) {
      setRunnerInstallMessage(getRunnerInstallMessage());
      toast({
        title: "Nao consegui abrir o login",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const finishCertificateLogin = async () => {
    if (!localRunnerEnabled) return;

    try {
      const response = await fetch(`${RUNNER_BASE_URL}/auth/finish`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Nao consegui finalizar o modo login.");
      const next = sessions.map((session) => session.source === "runner" && session.status === "waiting_user" ? {
        ...session,
        progressLabel: "Login certificado salvo. Abra o runner para continuar a automacao invisivel.",
        updatedAt: new Date().toISOString(),
      } : session);
      persistSessions(next);
      toast({ title: "Login finalizado", description: "O Chromium visivel foi fechado. As proximas consultas usam a sessao salva." });
    } catch (error) {
      toast({ title: "Nao consegui finalizar o login", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const openReport = (session: CnisSession) => {
    if (!session.reportHtml) return;
    const blob = new Blob([session.reportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast({ title: "Nao consegui abrir o relatorio", description: "Confira se o navegador bloqueou a nova aba.", variant: "destructive" });
      URL.revokeObjectURL(url);
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const clearHistory = () => {
    const next = selectedWorkspaceId ? sessions.filter((session) => session.workspaceId && session.workspaceId !== selectedWorkspaceId) : [];
    persistSessions(next);
    setSelectedId(null);
  };

  const downloadRunnerPackage = async () => {
    const installer = await openRunnerInstaller();
    if (installer.opened) {
      setRunnerInstallMessage(getRunnerDownloadedMessage(installer.platform));
      return;
    }

    setRunnerInstallMessage(getRunnerUnavailableMessage(installer.platform));
    toast({
      title: "Pacote indisponivel",
      description: getRunnerUnavailableMessage(installer.platform),
      variant: "destructive",
    });
  };

  const deleteSession = async (id: string) => {
    const target = sessions.find((session) => session.id === id);
    if (!target) return;
    if (localRunnerEnabled && target.runnerSessionId && activeStatuses.includes(target.status)) {
      await fetch(`${RUNNER_BASE_URL}/sessions/${target.runnerSessionId}/cancel`, { method: "POST" }).catch(() => {});
    }
    const next = sessions.filter((session) => session.id !== id);
    persistSessions(next);
    if (selectedId === id) setSelectedId(next[0]?.id || null);
  };

  const confirmTarget = confirmAction?.type === "delete"
    ? sessions.find((session) => session.id === confirmAction.sessionId)
    : null;

  const handleConfirmAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;
    if (action.type === "clear") {
      clearHistory();
      return;
    }
    await deleteSession(action.sessionId);
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
            <h1 className="shrink-0 text-lg font-semibold text-primary sm:text-xl">Wizzy Prev</h1>
            <WorkspaceSelector
              loading={loadingWorkspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              selectedWorkspaceName={selectedWorkspace?.name}
              workspaces={availableWorkspaces}
              onChange={setWorkspace}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {localRunnerEnabled && (
              <>
                <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 lg:inline-flex">
                  Runner local
                </Badge>
                <Button variant="outline" size="sm" onClick={openCertificateLogin} disabled={runnerChecking} className="gap-2">
                  {runnerChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  {runnerChecking ? "Verificando runner" : "Login certificado"}
                </Button>
                <Button variant="outline" size="sm" onClick={finishCertificateLogin} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Concluir login
                </Button>
                <Button variant="outline" size="sm" onClick={createRunnerSession} disabled={runnerChecking} className="gap-2">
                  <Bot className="h-4 w-4" />
                  Nova consulta
                </Button>
              </>
            )}
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
            {runnerCheckLabel && (
              <div className="mt-3 flex items-start gap-3 rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-950">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                <div>
                  <p className="font-semibold">Lendo runner local</p>
                  <p className="mt-1 text-xs">{runnerCheckLabel}</p>
                </div>
              </div>
            )}
            {runnerInstallMessage && (
              <div className="mt-3 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Runner local nao instalado ou bloqueado</p>
                  <p className="mt-1 text-xs">{runnerInstallMessage}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={downloadRunnerPackage} className="shrink-0 gap-2 bg-white">
                  <Download className="h-4 w-4" />
                  {runnerDownloadLabel}
                </Button>
              </div>
            )}
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
                      <Field label="Beneficio analisado">
                        <Input value="Auxilio-reclusao" readOnly />
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
                      <Field label="Consultas em massa">
                        <Textarea
                          value={form.batchText}
                          onChange={(event) => setForm((prev) => ({ ...prev, batchText: event.target.value }))}
                          rows={6}
                          placeholder={"Opcional: uma consulta por linha, ate 5.\nFormato: CPF; data da prisao\nEx: 12399882794; 12/12/2024"}
                          className="font-mono text-xs"
                        />
                      </Field>
                      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                        O limite operacional do runner local e de 5 consultas simultaneas. Para lote, informe apenas CPF e a data da prisao.
                      </div>
                    </div>

                    <div className="grid gap-2">
                      {localRunnerEnabled && (
                        <>
                          <Button onClick={createRunnerSession} disabled={runnerChecking} className="gap-2">
                            {runnerChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                            {runnerChecking ? "Verificando runner" : "Iniciar consulta(s)"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="m-0 min-h-0 flex-1 overflow-hidden">
                <div className="flex items-center justify-between border-b p-3">
                  <span className="text-sm font-medium">Consultas</span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmAction({ type: "clear" })} disabled={!visibleSessions.length} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Limpar
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100%-49px)]">
                  <div className="space-y-2 p-3">
                    {visibleSessions.length ? visibleSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`flex w-full items-start gap-2 rounded-md border p-3 transition-colors hover:bg-muted/60 ${selectedId === session.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                      >
                        <button type="button" onClick={() => setSelectedId(session.id)} className="min-w-0 flex-1 text-left">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{getSessionTitle(session)}</span>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <StatusBadge status={session.status} />
                              {session.analysis && <EligibilityBadge direito={session.analysis.direito} compact />}
                            </div>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{benefitLabels[session.benefitType || "auxilio_reclusao"]} - {session.cpf || "Sem CPF"} - {formatDateTime(session.createdAt)}</p>
                        </button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmAction({ type: "delete", sessionId: session.id })} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Apagar consulta</span>
                        </Button>
                      </div>
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
                  localRunnerEnabled={localRunnerEnabled}
                  runnerChecking={runnerChecking}
                  onDownload={() => openReport(selected)}
                  onCancel={() => cancelSession(selected.id)}
                  onOpenRunner={() => openRunnerForSession(selected.id)}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                  <div>
                    <FileText className="mx-auto mb-4 h-12 w-12 opacity-40" />
                    <p className="text-lg font-medium text-foreground">Crie ou selecione uma consulta</p>
                    <p className="mt-1 text-sm">O resultado da simulacao aparece aqui.</p>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
        <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
          <AlertDialogContent className="rounded-md border-border bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction?.type === "clear" ? "Limpar historico" : "Apagar consulta"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction?.type === "clear"
                  ? "Todas as consultas deste historico serao removidas do Wizzy Prev. Esta acao nao pode ser desfeita."
                  : `A consulta ${confirmTarget?.cpf ? `do CPF ${confirmTarget.cpf}` : "selecionada"} sera removida do historico. Esta acao nao pode ser desfeita.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {confirmAction?.type === "clear" ? "Limpar historico" : "Apagar consulta"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
  localRunnerEnabled,
  runnerChecking,
  onDownload,
  onCancel,
  onOpenRunner,
}: {
  session: CnisSession;
  localRunnerEnabled: boolean;
  runnerChecking: boolean;
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
            <h2 className="text-lg font-semibold">{getSessionTitle(session)}</h2>
            <StatusBadge status={session.status} />
            {summary && <EligibilityBadge direito={summary.direito} />}
          </div>
          <p className="text-sm text-muted-foreground">{session.progressLabel}</p>
        </div>
        <div className="flex gap-2">
          {localRunnerEnabled && session.source === "runner" && (
            <Button variant="outline" size="sm" onClick={onOpenRunner} disabled={runnerChecking} className="gap-2">
              {runnerChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              {runnerChecking ? "Verificando runner" : "Abrir runner"}
            </Button>
          )}
          {session.reportHtml && (
            <Button variant="outline" size="sm" onClick={onDownload} className="gap-2">
              <Download className="h-4 w-4" />
              Abrir relatorio
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
          {localRunnerEnabled && session.runnerSessionId && (
            <RunnerViewport session={session} localRunnerEnabled={localRunnerEnabled} onOpenRunner={onOpenRunner} />
          )}

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
            !session.runnerSessionId && (
              <RunnerViewport session={session} localRunnerEnabled={localRunnerEnabled} onOpenRunner={onOpenRunner} />
            )
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function RunnerViewport({
  session,
  localRunnerEnabled,
  onOpenRunner,
}: {
  session: CnisSession;
  localRunnerEnabled: boolean;
  onOpenRunner: () => void | Promise<void>;
}) {
  const [streamNonce, setStreamNonce] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [interactionStatus, setInteractionStatus] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hasRunner = localRunnerEnabled && Boolean(session.runnerSessionId);

  useEffect(() => {
    if (!hasRunner) return;
    setImageFailed(false);
    setStreamNonce((value) => value + 1);
  }, [hasRunner, session.runnerSessionId]);

  useEffect(() => {
    if (!hasRunner || !imageFailed) return;
    const timer = window.setInterval(() => {
      setImageFailed(false);
      setStreamNonce((value) => value + 1);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [hasRunner, imageFailed]);

  const sendClick = async (event: MouseEvent<HTMLDivElement>) => {
    if (!session.runnerSessionId) return;
    const image = imageRef.current;
    if (!image) return;
    const rect = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || rect.width;
    const naturalHeight = image.naturalHeight || rect.height;
    const relativeX = event.clientX - rect.left;
    const relativeY = event.clientY - rect.top;
    if (relativeX < 0 || relativeY < 0 || relativeX > rect.width || relativeY > rect.height) return;

    event.preventDefault();
    viewportRef.current?.focus();
    try {
      setInteractionStatus("Enviando clique ao runner...");
      const response = await fetch(`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/click`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          x: relativeX * naturalWidth / rect.width,
          y: relativeY * naturalHeight / rect.height,
          sourceWidth: naturalWidth,
          sourceHeight: naturalHeight,
        }),
      }).catch((error) => {
        throw new Error(error?.message || "Falha ao conectar ao runner local.");
      });
      if (!response.ok) throw new Error("Runner nao aceitou o clique.");
      setInteractionStatus("Clique enviado. Agora digite no campo selecionado.");
    } catch (error) {
      setInteractionStatus(error instanceof Error ? error.message : "Falha ao enviar clique ao runner.");
    }
  };

  const sendKeyboard = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (!session.runnerSessionId) return;
    const specialKeys = new Set(["Backspace", "Delete", "Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const payload = specialKeys.has(event.key) ? { key: event.key } : event.key.length === 1 && !event.ctrlKey && !event.metaKey ? { text: event.key } : null;
    if (!payload) return;
    event.preventDefault();
    try {
      const response = await fetch(`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/keyboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((error) => {
        throw new Error(error?.message || "Falha ao enviar teclado ao runner local.");
      });
      if (!response.ok) throw new Error("Runner nao aceitou o teclado.");
      setInteractionStatus("Tecla enviada ao runner.");
    } catch (error) {
      setInteractionStatus(error instanceof Error ? error.message : "Falha ao enviar teclado ao runner.");
    }
  };

  const sendPaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    if (!session.runnerSessionId) return;
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    try {
      const response = await fetch(`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/keyboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch((error) => {
        throw new Error(error?.message || "Falha ao colar texto no runner local.");
      });
      if (!response.ok) throw new Error("Runner nao aceitou o texto colado.");
      setInteractionStatus("Texto colado no runner.");
    } catch (error) {
      setInteractionStatus(error instanceof Error ? error.message : "Falha ao colar texto no runner.");
    }
  };

  const forcePanel = async () => {
    if (!session.runnerSessionId) return;
    setImageFailed(false);
    setStreamNonce((value) => value + 1);
    await fetch(`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/inject`, { method: "POST" }).catch(() => {});
  };

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-start gap-3">
          {hasRunner ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />}
          <div>
            <p className="font-medium">{hasRunner ? "Navegador CNIS espelhado em tempo real" : "Sessao pronta para automacao"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasRunner
                ? "Clique na imagem e digite para controlar a janela do runner. A tela abaixo acompanha o Chromium controlado ao vivo."
                : localRunnerEnabled
                  ? "Clique em Abrir runner para criar a janela controlada e mostrar a pagina aqui dentro."
                  : "A automacao por navegador controlado esta desativada neste ambiente."}
            </p>
          </div>
        </div>
        {localRunnerEnabled && !hasRunner && (
          <Button variant="outline" size="sm" onClick={onOpenRunner} className="gap-2">
            <Bot className="h-4 w-4" />
            Conectar runner
          </Button>
        )}
        {hasRunner && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {interactionStatus && <span className="text-xs text-muted-foreground">{interactionStatus}</span>}
            <Button variant="outline" size="sm" onClick={forcePanel} className="gap-2">
              <Bot className="h-4 w-4" />
              Forcar painel
            </Button>
          </div>
        )}
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        onClick={sendClick}
        onKeyDown={sendKeyboard}
        onPaste={sendPaste}
        className="flex min-h-0 flex-1 cursor-crosshair items-center justify-center bg-black/30 p-3 outline-none focus:ring-2 focus:ring-primary"
      >
        {hasRunner && !imageFailed ? (
          <img
            ref={imageRef}
            src={`${RUNNER_BASE_URL}/sessions/${session.runnerSessionId}/screenshot-stream?stream=${streamNonce}`}
            alt="Navegador controlado pelo runner CNIS"
            onLoad={() => setImageFailed(false)}
            onError={() => setImageFailed(true)}
            className="pointer-events-none max-h-full w-full max-w-full select-none rounded-sm object-contain shadow-sm"
            draggable={false}
          />
        ) : (
          <div className="max-w-md text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-4 h-12 w-12 opacity-40" />
            <p className="font-medium text-foreground">
              {localRunnerEnabled
                ? imageFailed ? "Ainda nao consegui receber a tela do runner." : "Nenhuma janela conectada ainda."
                : "Automacao local desativada."}
            </p>
            <p className="mt-2">
              {localRunnerEnabled
                ? imageFailed ? "Use Abrir runner para trazer a janela para frente ou crie uma nova consulta." : "O espelhamento em tempo real aparece aqui quando o runner abrir o Chromium controlado."
                : "Use a importacao manual do CNIS para gerar a analise."}
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

function EligibilityBadge({ direito, compact = false }: { direito: boolean; compact?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={`${compact ? "px-1.5 py-0 text-[10px]" : ""} ${direito
        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
        : "border-rose-200 bg-rose-100 text-rose-700"}`}
    >
      {direito ? "Direito verificado" : "Direito nao verificado"}
    </Badge>
  );
}

async function ensureRunnerAvailable(action: "certificate-login" | "open-runner") {
  if (await isRunnerOnline()) return;

  launchRunnerProtocol(action);
  const connected = await waitForRunner(12000);
  if (connected) return;

  throw new Error(getRunnerInstallMessage());
}

async function isRunnerOnline() {
  try {
    const response = await fetch(`${RUNNER_BASE_URL}/health`, { cache: "no-store" });
    const payload = await response.json();
    return Boolean(response.ok && payload?.ok);
  } catch {
    return false;
  }
}

async function waitForRunner(timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isRunnerOnline()) return true;
    await sleep(750);
  }
  return false;
}

function launchRunnerProtocol(action: "certificate-login" | "open-runner") {
  if (typeof window === "undefined") return;
  const base = RUNNER_PROTOCOL_URL.endsWith("://")
    ? RUNNER_PROTOCOL_URL
    : `${RUNNER_PROTOCOL_URL.replace(/\/+$/, "")}/`;
  window.location.href = `${base}${action}?return=${encodeURIComponent(window.location.href)}`;
}

async function openRunnerInstaller() {
  const platform = detectClientPlatform();
  const url = getRunnerInstallerUrl(platform);

  if (typeof window === "undefined" || !url) {
    return { opened: false, platform };
  }

  const available = await isDownloadAssetAvailable(url);
  if (!available) {
    return { opened: false, platform };
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getRunnerInstallerFilename(platform);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  return { opened: true, platform };
}

function getRunnerInstallerUrl(platform = detectClientPlatform()) {
  return platform === "macos"
    ? RUNNER_INSTALLER_MACOS_URL
    : platform === "windows"
      ? RUNNER_INSTALLER_WINDOWS_URL
      : RUNNER_INSTALLER_GENERIC_URL;
}

async function isDownloadAssetAvailable(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!response.ok) return false;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return false;

    const length = Number(response.headers.get("content-length") || 0);
    if (length > 0 && length < 1024 * 1024) return false;

    return true;
  } catch {
    return false;
  }
}

function getRunnerInstallerFilename(platform: "windows" | "macos" | "other") {
  if (platform === "windows") return "wizzy-prev-runner-win.exe";
  if (platform === "macos") return "wizzy-prev-runner-mac.dmg";
  return "wizzy-prev-runner";
}

function getRunnerInstallMessage() {
  const platform = detectClientPlatform();
  const url = getRunnerInstallerUrl(platform);
  if (!url) {
    return getRunnerUnavailableMessage(platform);
  }

  return `O Wizzy Prev Runner ainda nao esta ativo neste computador. Clique em ${getRunnerDownloadLabel(platform)} e conclua a instalacao uma vez. Depois volte aqui e clique em Login certificado novamente.`;
}

function detectClientPlatform(): "windows" | "macos" | "other" {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const userAgentDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || "";
  const text = `${userAgent} ${platform} ${userAgentDataPlatform}`.toLowerCase();
  if (text.includes("win")) return "windows";
  if (text.includes("mac")) return "macos";
  return "other";
}

function getPlatformLabel(platform: "windows" | "macos" | "other") {
  if (platform === "windows") return "Windows";
  if (platform === "macos") return "Mac";
  return "este sistema";
}

function getRunnerDownloadLabel(platform = detectClientPlatform()) {
  if (platform === "windows") return "Baixar runner Windows";
  if (platform === "macos") return "Baixar runner Mac";
  return "Baixar runner";
}

function getRunnerDownloadedMessage(platform: "windows" | "macos" | "other") {
  if (platform === "windows") {
    return "Download iniciado para Windows. Depois de baixar, execute o instalador uma vez.";
  }
  if (platform === "macos") {
    return "Download iniciado para Mac. Depois de baixar, abra o pacote do runner e conclua a instalacao uma vez.";
  }
  return "Download iniciado. Depois de baixar, conclua a instalacao do runner uma vez.";
}

function getRunnerUnavailableMessage(platform: "windows" | "macos" | "other") {
  if (platform === "macos") {
    return "O Wizzy Prev Runner para Mac ainda nao esta configurado para download automatico. Baixe a versao Mac quando ela estiver publicada.";
  }
  if (platform === "windows") {
    return "O Wizzy Prev Runner para Windows ainda nao esta configurado para download automatico.";
  }
  return "Nao ha pacote automatico do Wizzy Prev Runner configurado para este sistema.";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeRunnerSessions(current: CnisSession[], runnerSessions: RunnerSession[], workspaceId?: string | null): CnisSession[] {
  let changed = false;
  const runnerById = new Map(runnerSessions.map((session) => [session.id, session]));
  const knownRunnerIds = new Set(current.map((session) => session.runnerSessionId).filter(Boolean));

  const next = current.map((session) => {
    if (!session.runnerSessionId) return session;
    const runner = runnerById.get(session.runnerSessionId);
    if (!runner) {
      if (activeStatuses.includes(session.status)) {
        changed = true;
        return {
          ...session,
          runnerSessionId: undefined,
          status: "waiting_user" as const,
          progressLabel: "Runner reiniciado ou sessao do Chromium perdida. Abra uma nova consulta para espelhar novamente.",
          updatedAt: new Date().toISOString(),
        };
      }

      if (session.runnerSessionId) {
        changed = true;
        return {
          ...session,
          runnerSessionId: undefined,
          updatedAt: new Date().toISOString(),
        };
      }

      return session;
    }

    const base: CnisSession = {
      ...session,
      status: runner.status || session.status,
      progressLabel: runner.progressLabel || session.progressLabel,
      errorMessage: runner.errorMessage || session.errorMessage,
      updatedAt: new Date().toISOString(),
    };

    if (runner.result?.vinculos?.length) {
      const nome = runner.result.nome || runner.nome || "";
      const cpf = runner.result.cpf || runner.cpf || session.cpf;
      const prisonDate = runner.result.prisonDate || runner.prisonDate || session.prisonDate;
      const todayDate = runner.result.todayDate || runner.todayDate || session.todayDate;
      const vinculos = reviveVinculos(runner.result.vinculos);
      const benefitType: CnisBenefitType = "auxilio_reclusao";
      const analysis = prisonDate ? analyzeCNIS(vinculos, prisonDate, { todayDate, benefitType }) : null;
      const reportHtml = runner.result.reportHtml || (analysis ? buildCnisReportHtml({ nome, cpf, prisonDate, todayDate, analysis }) : session.reportHtml);

      changed = true;
      return {
        ...base,
        status: "completed" as const,
        nome,
        cpf,
        prisonDate,
        todayDate,
        benefitType,
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
      const nome = result?.nome || runner.nome || "";
      const cpf = result?.cpf || runner.cpf || "";
      const prisonDate = result?.prisonDate || runner.prisonDate || "";
      const todayDate = result?.todayDate || runner.todayDate || new Date().toISOString().slice(0, 10);
      const benefitType: CnisBenefitType = "auxilio_reclusao";
      const vinculos = result?.vinculos?.length ? reviveVinculos(result.vinculos) : [];
      const analysis = vinculos.length && prisonDate ? analyzeCNIS(vinculos, prisonDate, { todayDate, benefitType }) : null;
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
        benefitType,
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

function parseRunnerInputs(cpf: string, eventDate: string, batchText: string): Array<{ cpf: string; prisonDate: string }> {
  const lines = batchText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    const normalizedCpf = normalizeCpf(cpf);
    if (!normalizedCpf || !eventDate) throw new Error("Informe CPF e data da prisao, ou preencha o lote.");
    return [{ cpf: normalizedCpf, prisonDate: eventDate }];
  }

  return lines.map((line, index) => {
    const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    const [rawCpf, rawDate] = line.split(separator).map((part) => part.trim());
    const normalizedCpf = normalizeCpf(rawCpf);
    const normalizedDate = normalizeInputDate(rawDate);
    if (!normalizedCpf || !normalizedDate) {
      throw new Error(`Linha ${index + 1}: use CPF; data em dd/mm/aaaa ou aaaa-mm-dd.`);
    }
    return { cpf: normalizedCpf, prisonDate: normalizedDate };
  });
}

function normalizeCpf(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 ? digits : "";
}

function normalizeInputDate(value: string): string {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!br) return "";
  return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
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
  const benefitType: CnisBenefitType = "auxilio_reclusao";
  const analysis = vinculos.length && session.prisonDate
    ? analyzeCNIS(vinculos, session.prisonDate, { todayDate: session.todayDate, benefitType })
    : null;
  return {
    ...session,
    benefitType,
    vinculos,
    analysis,
    reportHtml: session.reportHtml || (analysis ? buildCnisReportHtml({
      nome: session.nome || "",
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

function getSessionTitle(session: CnisSession) {
  if (session.nome) return session.nome;
  return `${benefitLabels.auxilio_reclusao} - ${session.cpf || "Sem CPF"}`;
}
