import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquareText, Tag, Webhook, Copy, Check, RefreshCw, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { FALLBACK_MATCH_TYPE } from "@/lib/campaignKeywordMatch";
import type { CampaignCollision, FallbackConflict } from "@/lib/campaignKeywordMatch";

interface TagOption {
    id: string;
    name: string;
    color?: string;
}

interface CampaignTriggerFieldsProps {
    triggerType: string;
    onTriggerTypeChange: (value: string) => void;
    triggerKeyword: string;
    onTriggerKeywordChange: (value: string) => void;
    matchType: string;
    onMatchTypeChange: (value: string) => void;
    tags: TagOption[];
    /** Público do gatilho: vazio = qualquer contato dispara (o padrão de sempre). */
    triggerTagIds?: string[];
    onTriggerTagIdsChange?: (value: string[]) => void;
    /** any | all | none -- como combinar as tags de público. */
    triggerTagMatch?: string;
    onTriggerTagMatchChange?: (value: string) => void;
    /** Desempate quando o texto colide com outra campanha. Maior ganha. */
    triggerPriority?: number;
    onTriggerPriorityChange?: (value: number) => void;
    /** Dispara mesmo com fluxo em andamento na conversa (comando interno). */
    interrompeFluxo?: boolean;
    onInterrompeFluxoChange?: (value: boolean) => void;
    /** Campanhas ativas que a mesma mensagem também dispararia. */
    collisions?: CampaignCollision[];
    /** Outras campanhas "qualquer mensagem" ativas -- duas seriam sorteio. */
    fallbackConflicts?: FallbackConflict[];
    /** Vazio até a campanha existir de verdade -- mostra o placeholder "salve primeiro". */
    webhookUrl: string;
    onCopyWebhookUrl: () => void;
    copied: boolean;
    /** Omitido quando ainda não há campanha salva pra rotacionar o token. */
    onRotateWebhookUrl?: () => void;
    isRotatingWebhookUrl?: boolean;
}

// Bloco "Gatilho (Como a campanha inicia?)" -- extraído de CampaignDialog.tsx
// pra ser reaproveitado também na criação guiada de orquestração (ver
// conversa com o usuário: "a palavra chave teria que configurar tipo quando
// configura dentro de campanhas, não é só palavra-chave").
export function CampaignTriggerFields({
    triggerType,
    onTriggerTypeChange,
    triggerKeyword,
    onTriggerKeywordChange,
    matchType,
    onMatchTypeChange,
    tags,
    triggerTagIds = [],
    onTriggerTagIdsChange,
    triggerTagMatch = 'any',
    onTriggerTagMatchChange,
    triggerPriority = 0,
    onTriggerPriorityChange,
    interrompeFluxo = false,
    onInterrompeFluxoChange,
    collisions = [],
    fallbackConflicts = [],
    webhookUrl,
    onCopyWebhookUrl,
    copied,
    onRotateWebhookUrl,
    isRotatingWebhookUrl,
}: CampaignTriggerFieldsProps) {
    const toggleAudienceTag = (tagId: string) => {
        if (!onTriggerTagIdsChange) return;
        onTriggerTagIdsChange(
            triggerTagIds.includes(tagId)
                ? triggerTagIds.filter((id) => id !== tagId)
                : [...triggerTagIds, tagId],
        );
    };

    const isFallback = matchType === FALLBACK_MATCH_TYPE;

    // "Qualquer mensagem" só aparece onde a tela sabe guardar o público. Ela é o
    // único tipo que casa com TODA mensagem: sem o filtro de "Quem pode disparar"
    // ela responderia a qualquer contato, inclusive quem está no meio de uma conversa
    // com o time. A criação guiada de orquestração usa este mesmo componente e não
    // passa os handlers de público -- lá o tipo fica de fora.
    const canUseFallback = Boolean(onTriggerTagIdsChange);

    const AUDIENCE_MATCH_LABELS: Record<string, string> = {
        any: 'Tem pelo menos uma das tags',
        all: 'Tem todas as tags',
        none: 'Não tem nenhuma das tags',
    };

    const triggerOptions = [
        {
            id: 'keyword',
            label: 'Palavra-chave',
            description: 'Quando o cliente envia uma mensagem com palavra específica',
            icon: MessageSquareText,
        },
        {
            id: 'tag_added',
            label: 'Tag Adicionada',
            description: 'Quando uma tag específica é adicionada ao contato',
            icon: Tag,
        },
        {
            id: 'webhook',
            label: 'Webhook',
            description: 'Disparado por uma chamada HTTP externa',
            icon: Webhook,
        },
    ];

    return (
        <div className="grid gap-2">
            <Label>Gatilho (Como a campanha inicia?)</Label>
            <RadioGroup
                value={triggerType}
                onValueChange={onTriggerTypeChange}
                className="space-y-3 mt-2"
            >
                {triggerOptions.map((option) => {
                    const Icon = option.icon;
                    const isSelected = triggerType === option.id;

                    return (
                        <div key={option.id}>
                            <Label
                                htmlFor={option.id}
                                className={cn(
                                    "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-muted/50",
                                    isSelected
                                        ? "border-primary bg-primary/5 hover:bg-primary/5"
                                        : "border-border"
                                )}
                            >
                                <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                                <div className={cn(
                                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                    isSelected ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
                                )}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-foreground">{option.label}</p>
                                    <p className="text-[13px] text-muted-foreground mt-0.5">{option.description}</p>
                                </div>
                            </Label>

                            {/* Mostrar opções extras se for Palavra Chave */}
                            {isSelected && option.id === 'keyword' && (
                                <div className="mt-4 ml-14 space-y-4 p-4 rounded-lg border bg-muted/10">
                                    {/* "Qualquer mensagem" não tem texto para escrever: é
                                        justamente a campanha de quem não casou com nenhuma
                                        palavra. O campo some em vez de ficar vazio e ignorado. */}
                                    {!isFallback && (
                                    <div className="grid gap-2">
                                        <Label htmlFor="keyword" className="text-xs">Palavras-chave</Label>
                                        <Textarea
                                            id="keyword"
                                            placeholder="Ex: QUERO, SIM, promoção"
                                            value={triggerKeyword}
                                            onChange={(e) => onTriggerKeywordChange(e.target.value)}
                                            className="min-h-[60px] text-sm"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            {matchType === 'all_words'
                                                ? 'Separe por vírgula. A campanha só dispara se a mensagem tiver TODOS os termos, em qualquer ordem (ignora acento, pontuação e espaço extra).'
                                                : 'Separe as palavras por vírgula. Qualquer uma delas já dispara a campanha.'}
                                        </p>
                                    </div>
                                    )}

                                    <div className="grid gap-2">
                                        <Label className="text-xs">Regra</Label>
                                        <Select value={matchType} onValueChange={onMatchTypeChange}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Selecione a regra" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="exact">Mensagem exata (só a palavra)</SelectItem>
                                                <SelectItem value="contains">Contém qualquer uma das palavras</SelectItem>
                                                <SelectItem value="all_words">Contém todas as palavras (em qualquer ordem)</SelectItem>
                                                <SelectItem value="starts_with">Frase começa com a palavra</SelectItem>
                                                {(canUseFallback || isFallback) && (
                                                    <SelectItem value={FALLBACK_MATCH_TYPE}>
                                                        Qualquer mensagem (nenhuma outra campanha reconheceu)
                                                    </SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        {isFallback && (
                                            <p className="text-[10px] text-muted-foreground">
                                                Dispara quando nenhuma outra campanha reconhecer a mensagem. É sempre a última a ser
                                                consultada: qualquer campanha com palavra-chave ganha desta, mesmo com prioridade menor.
                                                Só vale para mensagem de texto — áudio, figurinha e mídia não disparam.
                                            </p>
                                        )}
                                    </div>

                                    {/* Duas campanhas "qualquer mensagem" ativas é sorteio: as
                                        duas casam com tudo e não há texto para desempatar. */}
                                    {isFallback && fallbackConflicts.length > 0 && (
                                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                                <div className="space-y-1">
                                                    <p className="text-xs font-medium text-foreground">
                                                        Já existe {fallbackConflicts.length === 1 ? 'outra campanha' : `outras ${fallbackConflicts.length} campanhas`} de "qualquer mensagem" ativa
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Qual delas atende cada mensagem vira sorteio — as duas casam com tudo e não há
                                                        palavra-chave para desempatar. Desative {fallbackConflicts.length === 1 ? 'a outra' : 'as outras'} ou
                                                        separe o público em <strong>Quem pode disparar</strong>.
                                                    </p>
                                                    <ul className="space-y-0.5">
                                                        {fallbackConflicts.map((c) => (
                                                            <li key={c.id} className="text-[11px] text-muted-foreground">
                                                                <strong className="text-foreground">{c.name}</strong>
                                                                {!c.sameWorkspace && ' — em outro workspace (o gatilho não olha workspace: disputa igual)'}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Aviso de colisão. Duas campanhas com textos que se
                                        sobrepõem sempre foram permitidas e nunca deram erro --
                                        o webhook simplesmente escolhia uma. Antes era sorteio;
                                        agora a prioridade decide, mas a pessoa precisa ver que
                                        está escolhendo. */}
                                    {collisions.length > 0 && (
                                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                                <p className="text-xs font-medium text-foreground">
                                                    A mesma mensagem também dispara {collisions.length === 1 ? 'outra campanha' : `outras ${collisions.length} campanhas`}
                                                </p>
                                            </div>
                                            <ul className="space-y-1 pl-6">
                                                {collisions.map((c) => (
                                                    <li key={c.id} className="text-[11px] text-muted-foreground">
                                                        <span className="font-mono">{c.keyword}</span> também cai em{' '}
                                                        <strong className="text-foreground">{c.name}</strong> —{' '}
                                                        {c.winner === 'esta'
                                                            ? 'esta campanha ganha (prioridade maior).'
                                                            : 'quem ganha hoje é a outra. Suba a prioridade abaixo para inverter.'}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Público. Sem isto, toda palavra-chave era aberta para a
                                        base inteira: qualquer lead que digitasse a palavra
                                        disparava a campanha.
                                        Só aparece onde o pai sabe guardar o valor -- a criação
                                        guiada de orquestração usa este mesmo componente e não
                                        passa os handlers; mostrar tags que não gravam nada
                                        seria pior que não mostrar. */}
                                    {onTriggerTagIdsChange && (
                                    <div className="grid gap-2">
                                        <Label className="text-xs flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5" />
                                            Quem pode disparar
                                        </Label>
                                        {triggerTagIds.length > 0 && (
                                            <Select value={triggerTagMatch} onValueChange={(v) => onTriggerTagMatchChange?.(v)}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Object.entries(AUDIENCE_MATCH_LABELS).map(([value, label]) => (
                                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        {tags.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {tags.map((tag) => {
                                                    const selected = triggerTagIds.includes(tag.id);
                                                    return (
                                                        <button
                                                            key={tag.id}
                                                            type="button"
                                                            onClick={() => toggleAudienceTag(tag.id)}
                                                            className={cn(
                                                                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                                                                selected
                                                                    ? "border-primary bg-primary/10 text-foreground"
                                                                    : "border-border text-muted-foreground hover:bg-muted/50"
                                                            )}
                                                        >
                                                            <span
                                                                className="h-2 w-2 rounded-full"
                                                                style={{ backgroundColor: tag.color || '#6366f1' }}
                                                            />
                                                            {tag.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-muted-foreground italic">Nenhuma tag criada ainda.</p>
                                        )}
                                        <p className="text-[10px] text-muted-foreground">
                                            {triggerTagIds.length === 0
                                                ? (isFallback
                                                    ? 'Nenhuma tag marcada: qualquer contato que escrever qualquer coisa cai nesta campanha, sempre. Normalmente se usa "Não tem nenhuma das tags" com a etiqueta de quem já foi identificado.'
                                                    : 'Nenhuma tag marcada: qualquer contato que mandar a palavra-chave dispara a campanha.')
                                                : `${AUDIENCE_MATCH_LABELS[triggerTagMatch] ?? ''}. Quem estiver fora não dispara — a mensagem segue como conversa normal.`}
                                        </p>
                                    </div>
                                    )}

                                    {/* Prioridade não existe para "qualquer mensagem": ela é
                                        avaliada num segundo passe, depois de todas as outras,
                                        então perde de qualquer campanha com texto por
                                        construção. Um número aqui só faria acreditar no
                                        contrário. */}
                                    {onTriggerPriorityChange && !isFallback && (
                                    <div className="grid gap-2">
                                        <Label htmlFor="trigger_priority" className="text-xs">Prioridade</Label>
                                        <Input
                                            id="trigger_priority"
                                            type="number"
                                            className="h-9"
                                            value={triggerPriority}
                                            onChange={(e) => onTriggerPriorityChange(Number(e.target.value) || 0)}
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            Quando o texto cai em mais de uma campanha, a de maior prioridade ganha. Empate: a campanha mais antiga.
                                        </p>
                                    </div>
                                    )}

                                    {/* Comando interno. Por padrão, conversa com fluxo em
                                        andamento pertence ao fluxo: a mensagem é lida como
                                        resposta dele e nenhuma campanha é consultada. Marcar
                                        isto abre a exceção só para esta campanha.
                                        Igual ao público e à prioridade, só aparece onde o pai
                                        sabe guardar o valor. */}
                                    {onInterrompeFluxoChange && (
                                    <div className="grid gap-2">
                                        <label className={cn(
                                            "flex items-start gap-2.5",
                                            isFallback ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                                        )}>
                                            <Checkbox
                                                checked={interrompeFluxo && !isFallback}
                                                disabled={isFallback}
                                                onCheckedChange={(checked) => onInterrompeFluxoChange(checked === true)}
                                                className="mt-0.5"
                                            />
                                            <span className="grid gap-0.5">
                                                <span className="text-xs font-medium text-foreground">
                                                    Interromper conversa em andamento
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    Para comandos internos, como pedir um relatório. Sem isto, quem já está no meio de um fluxo não consegue disparar a palavra-chave — a mensagem vira resposta do fluxo.
                                                </span>
                                            </span>
                                        </label>

                                        {/* Casar com tudo + interromper tudo tiraria a base inteira
                                            de dentro dos fluxos com qualquer mensagem. O webhook
                                            também recusa a combinação, e o banco tem CHECK -- aqui
                                            é só onde ela deixa de ser oferecida. */}
                                        {isFallback && (
                                            <p className="text-[10px] text-muted-foreground pl-6">
                                                Indisponível para "qualquer mensagem": como ela casa com tudo, interromper tiraria
                                                qualquer contato de dentro do fluxo dele à primeira mensagem. Quem já está num fluxo
                                                continua nele.
                                            </p>
                                        )}

                                        {interrompeFluxo && !isFallback && (
                                            <p className="text-[10px] text-muted-foreground pl-6">
                                                O fluxo em andamento não é cancelado: fica parado onde estava e continua depois que esta campanha terminar.
                                            </p>
                                        )}

                                        {/* Interromper + público aberto = qualquer lead pausa o
                                            próprio atendimento escrevendo a palavra. Avisa, não
                                            bloqueia: pode ser exatamente o que a pessoa quer. */}
                                        {interrompeFluxo && !isFallback && triggerTagIds.length === 0 && (
                                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                                                <div className="flex items-start gap-2">
                                                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                                    <div className="space-y-1">
                                                        <p className="text-xs font-medium text-foreground">
                                                            Qualquer contato vai poder interromper o próprio atendimento
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            Como nenhuma tag está marcada em <strong>Quem pode disparar</strong>, um lead no meio de um fluxo que escrever esta palavra-chave sai dele e cai nesta campanha. Restrinja o público acima se isto for um comando interno.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            )}

                            {/* Mostrar opções se for Tag Adicionada */}
                            {isSelected && option.id === 'tag_added' && (
                                <div className="mt-4 ml-14 space-y-4 p-4 rounded-lg border bg-muted/10">
                                    <div className="grid gap-2">
                                        <Label className="text-xs">Tag</Label>
                                        <Select value={triggerKeyword} onValueChange={onTriggerKeywordChange}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Selecione a tag" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {tags.map((tag) => (
                                                    <SelectItem key={tag.id} value={tag.id}>
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className="w-3 h-3 rounded-full"
                                                                style={{ backgroundColor: tag.color || '#6366f1' }}
                                                            />
                                                            {tag.name}
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}

                            {/* Mensagem para Webhook */}
                            {isSelected && option.id === 'webhook' && (
                                <div className="mt-4 ml-14 p-4 rounded-lg border bg-primary/5 space-y-3">
                                    <p className="text-sm text-foreground font-medium">Como utilizar este webhook?</p>
                                    <p className="text-xs text-muted-foreground">
                                        Faça uma requisição HTTP <strong>POST</strong> para a URL abaixo enviando o número e os dados do contato. Cada contato cria/atualiza o cadastro, abre uma conversa e dispara o fluxo selecionado.
                                    </p>
                                    {webhookUrl ? (
                                        <>
                                            <div className="grid gap-1.5">
                                                <Label className="text-xs">URL do Webhook (POST)</Label>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 bg-background border rounded px-2 py-1.5 text-[10px] sm:text-xs text-muted-foreground break-all font-mono">
                                                        {webhookUrl}
                                                    </code>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8 shrink-0"
                                                        onClick={onCopyWebhookUrl}
                                                        title="Copiar URL"
                                                    >
                                                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="bg-background border rounded p-3 mt-1">
                                                <code className="text-[10px] sm:text-xs text-muted-foreground break-all whitespace-pre-wrap font-mono">
                                                    {`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "5511999999999", "name": "João", "cpf": "123"}'`}
                                                </code>
                                            </div>

                                            <p className="text-[11px] text-muted-foreground">
                                                Para disparar para vários contatos de uma vez, envie uma lista: <code className="font-mono">[{`{"phone": "..."}`}, {`{"phone": "..."}`}]</code> (até 100 por chamada).
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Os campos enviados ficam disponíveis no fluxo como <code className="font-mono">{`{{phone}}`}</code>, <code className="font-mono">{`{{name}}`}</code>, <code className="font-mono">{`{{cpf}}`}</code> etc.
                                            </p>

                                            {onRotateWebhookUrl && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs text-muted-foreground"
                                                    onClick={onRotateWebhookUrl}
                                                    disabled={isRotatingWebhookUrl}
                                                >
                                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                                    Gerar nova URL
                                                </Button>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic mt-2">
                                            Salve a campanha primeiro para ver a URL do webhook.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </RadioGroup>
        </div>
    );
}
