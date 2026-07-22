import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Play, Sparkles } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from "recharts";
import { cn } from "@/lib/utils";

export interface SimulatedMessage {
  id: string;
  role: "persona" | "agent";
  content: string;
}

export interface EvaluationCriterion {
  label: string;
  passed: boolean;
}

export interface TestRound {
  roundNumber: number;
  score: number;
}

interface AgentTesterPanelProps {
  templateName: string;
  personaLabel: string;
  messages: SimulatedMessage[];
  evaluation: EvaluationCriterion[];
  suggestion: string;
  rounds: TestRound[];
  personasPerRound: number;
  onApplyAdjustment: () => void;
  onRunNewConversation: () => void;
  onRunMoreRounds: (count: number) => void;
}

export function AgentTesterPanel(props: AgentTesterPanelProps) {
  const {
    templateName,
    personaLabel,
    messages,
    evaluation,
    suggestion,
    rounds,
    personasPerRound,
    onApplyAdjustment,
    onRunNewConversation,
    onRunMoreRounds,
  } = props;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900"
        >
          Rascunho - nao publicado
        </Badge>
        <span className="text-sm text-muted-foreground">
          Testando: {templateName}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <SimulatedChat personaLabel={personaLabel} messages={messages} />
        <EvaluationPanel
          evaluation={evaluation}
          suggestion={suggestion}
          onApplyAdjustment={onApplyAdjustment}
          onRunNewConversation={onRunNewConversation}
        />
      </div>

      <MassTestSummary
        rounds={rounds}
        personasPerRound={personasPerRound}
        onRunMoreRounds={onRunMoreRounds}
      />
    </div>
  );
}

function SimulatedChat({
  personaLabel,
  messages,
}: {
  personaLabel: string;
  messages: SimulatedMessage[];
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center text-xs text-purple-700 dark:text-purple-300 font-medium">
          P
        </div>
        <span className="text-sm text-muted-foreground">
          Persona simulada: {personaLabel}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "text-sm px-3 py-2 rounded-xl max-w-[80%]",
              message.role === "persona"
                ? "self-end bg-primary/10 rounded-br-sm"
                : "self-start bg-muted rounded-bl-sm"
            )}
          >
            {message.content}
          </div>
        ))}
      </div>
    </Card>
  );
}

function EvaluationPanel({
  evaluation,
  suggestion,
  onApplyAdjustment,
  onRunNewConversation,
}: {
  evaluation: EvaluationCriterion[];
  suggestion: string;
  onApplyAdjustment: () => void;
  onRunNewConversation: () => void;
}) {
  return (
    <Card className="p-4 bg-muted/40">
      <p className="text-sm font-medium mb-3">Avaliacao da conversa</p>

      <div className="flex flex-col gap-2 mb-3">
        {evaluation.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            {item.passed ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <X className="w-4 h-4 text-destructive" />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        Sugestao: {suggestion}
      </p>

      <div className="flex flex-col gap-2">
        <Button size="sm" onClick={onApplyAdjustment} className="w-full">
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Aplicar ajuste no fluxo
        </Button>
        <Button size="sm" variant="outline" onClick={onRunNewConversation} className="w-full">
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Rodar nova conversa
        </Button>
      </div>
    </Card>
  );
}

function scoreColor(score: number) {
  if (score < 55) return "hsl(var(--destructive))";
  if (score < 75) return "#d97706";
  return "#059669";
}

function MassTestSummary({
  rounds,
  personasPerRound,
  onRunMoreRounds,
}: {
  rounds: TestRound[];
  personasPerRound: number;
  onRunMoreRounds: (count: number) => void;
}) {
  const data = rounds.map((r) => ({ name: "R" + r.roundNumber, score: r.score }));

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">
          Teste em massa - {rounds.length} rodadas - {personasPerRound} personas por rodada
        </p>
        <Button size="sm" variant="outline" onClick={() => onRunMoreRounds(10)}>
          Rodar mais 10
        </Button>
      </div>

      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={scoreColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        className="grid gap-2 text-center text-[11px] text-muted-foreground mt-1"
        style={{ gridTemplateColumns: "repeat(" + rounds.length + ", 1fr)" }}
      >
        {rounds.map((r) => (
          <span key={r.roundNumber}>
            R{r.roundNumber} - {r.score}%
          </span>
        ))}
      </div>
    </Card>
  );
}
