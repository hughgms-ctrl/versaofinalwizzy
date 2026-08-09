import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useTags } from '@/hooks/useTags';
import {
  useContactCustomFields,
  useCreateContactCustomField,
  slugifyFieldKey,
  type ContactCustomField,
} from '@/hooks/useContactCustomFields';
import { useImportContacts, type ImportContactRow, type ImportResult } from '@/hooks/useImportContacts';
import {
  parseSpreadsheet,
  suggestMapping,
  ACCEPTED_FILE_TYPES,
  type ParsedSheet,
} from '@/lib/spreadsheetParser';
import { cn } from '@/lib/utils';

interface ImportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'mapping' | 'enrich' | 'review';

/** Valor especial do Select: a coluna não será importada. */
const IGNORE = '__ignore__';
/** Valor especial do Select de workspace: contato sem workspace. */
const NO_WORKSPACE = '__none__';

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Arquivo' },
  { id: 'mapping', label: 'Colunas' },
  { id: 'enrich', label: 'Tags e campos' },
  { id: 'review', label: 'Revisão' },
];

const FIXED_TARGETS = [
  { value: 'phone', label: 'Telefone' },
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
];

export function ImportContactsDialog({ open, onOpenChange }: ImportContactsDialogProps) {
  const { selectedWorkspaceId, availableWorkspaces } = useWorkspaceContext();
  const { data: tags = [] } = useTags();
  const { data: customFields = [] } = useContactCustomFields();
  const createCustomField = useCreateContactCustomField();
  const { runImport, isImporting, progress } = useImportContacts();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [isParsing, setIsParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);

  /** header da planilha -> 'phone' | 'name' | 'email' | chave de campo custom | IGNORE */
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [workspaceId, setWorkspaceId] = useState<string>(
    selectedWorkspaceId && selectedWorkspaceId !== 'unassigned' ? selectedWorkspaceId : NO_WORKSPACE,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  /** Valores fixos aplicados a todos os contatos do lote: chave -> valor. */
  const [commonCustom, setCommonCustom] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  // Criação de campo customizado inline (usada no passo de mapeamento e no de tags).
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldForHeader, setNewFieldForHeader] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setSheet(null);
    setFileName('');
    setMapping({});
    setSelectedTagIds([]);
    setCommonCustom({});
    setResult(null);
    setNewFieldLabel('');
    setNewFieldForHeader(null);
    setWorkspaceId(
      selectedWorkspaceId && selectedWorkspaceId !== 'unassigned' ? selectedWorkspaceId : NO_WORKSPACE,
    );
  }, [selectedWorkspaceId]);

  const handleOpenChange = (next: boolean) => {
    // Não deixa fechar no meio da gravação: o lote em andamento continuaria
    // rodando sem ninguém para reportar o resultado.
    if (!next && isImporting) return;
    if (!next) resetState();
    onOpenChange(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setIsParsing(true);
    try {
      const parsed = await parseSpreadsheet(file);
      setSheet(parsed);
      setFileName(file.name);
      setMapping(suggestMapping(parsed.headers));
      setStep('mapping');
    } catch (error) {
      toast({
        title: 'Erro ao ler o arquivo',
        description: (error as Error)?.message || 'Confira o formato e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
      // Permite reselecionar o mesmo arquivo depois de um erro.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const phoneHeader = useMemo(
    () => Object.keys(mapping).find((header) => mapping[header] === 'phone') || null,
    [mapping],
  );

  /** Impede mapear dois cabeçalhos para o mesmo destino (o segundo sobrescreveria o primeiro). */
  const setMappingFor = (header: string, target: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (target === IGNORE) {
        delete next[header];
        return next;
      }
      for (const key of Object.keys(next)) {
        if (key !== header && next[key] === target) delete next[key];
      }
      next[header] = target;
      return next;
    });
  };

  /** Retorna true se o campo foi criado; false mantém o formulário aberto para correção. */
  const handleCreateField = async (label: string, headerToMap: string | null): Promise<boolean> => {
    const trimmed = label.trim();
    if (!trimmed) return false;
    try {
      const field = await createCustomField.mutateAsync({ label: trimmed });
      if (headerToMap) setMappingFor(headerToMap, field.key);
      setNewFieldLabel('');
      setNewFieldForHeader(null);
      toast({
        title: 'Campo criado',
        description: `Use {{${field.key}}} nos fluxos para inserir este valor.`,
      });
      return true;
    } catch {
      // O hook já mostra o toast de erro; o formulário fica aberto com o texto
      // digitado para o usuário ajustar (ex.: chave duplicada).
      return false;
    }
  };

  // Linhas prontas para envio, já com telefone limpo.
  const preparedRows = useMemo((): ImportContactRow[] => {
    if (!sheet || !phoneHeader) return [];
    return sheet.rows.map((row) => {
      const custom: Record<string, string> = {};
      for (const [header, target] of Object.entries(mapping)) {
        if (target === 'phone' || target === 'name' || target === 'email') continue;
        const value = row[header];
        if (value) custom[target] = value;
      }
      const nameHeader = Object.keys(mapping).find((h) => mapping[h] === 'name');
      const emailHeader = Object.keys(mapping).find((h) => mapping[h] === 'email');
      return {
        phone: String(row[phoneHeader] || '').replace(/\D/g, ''),
        name: nameHeader ? row[nameHeader] || null : null,
        email: emailHeader ? row[emailHeader] || null : null,
        custom,
      };
    });
  }, [sheet, mapping, phoneHeader]);

  const validRows = useMemo(
    () => preparedRows.filter((row) => row.phone.length >= 8),
    [preparedRows],
  );
  const invalidCount = preparedRows.length - validRows.length;

  // Só envia valores fixos de campos que NÃO vêm de uma coluna da planilha.
  // O usuário pode ter digitado um valor fixo e depois voltado ao mapeamento
  // para associar aquele campo a uma coluna: o valor antigo continua no estado
  // mas some da tela, e sem este filtro ele seria gravado às escondidas nas
  // linhas cuja célula está vazia.
  const effectiveCommonCustom = useMemo(() => {
    const mappedKeys = new Set(Object.values(mapping));
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(commonCustom)) {
      if (mappedKeys.has(key)) continue;
      if (!value.trim()) continue;
      out[key] = value;
    }
    return out;
  }, [commonCustom, mapping]);

  const handleImport = async () => {
    try {
      const importResult = await runImport({
        rows: validRows,
        workspaceId: workspaceId === NO_WORKSPACE ? null : workspaceId,
        tagIds: selectedTagIds,
        commonCustom: effectiveCommonCustom,
      });
      setResult(importResult);
      toast({
        title: 'Importação concluída',
        description: `${importResult.created} criado(s), ${importResult.updated} atualizado(s).`,
      });
    } catch (error) {
      toast({
        title: 'Erro na importação',
        description: (error as Error)?.message || 'Não foi possível importar os contatos.',
        variant: 'destructive',
      });
    }
  };

  const goNext = () => {
    if (step === 'upload') {
      // Só alcançável quando já há arquivo lido (o botão fica desabilitado sem
      // sheet), ou seja, ao voltar do mapeamento e seguir de novo.
      if (sheet) setStep('mapping');
    } else if (step === 'mapping') {
      if (!phoneHeader) {
        toast({
          title: 'Telefone obrigatório',
          description: 'Escolha qual coluna da planilha contém o telefone.',
          variant: 'destructive',
        });
        return;
      }
      setStep('enrich');
    } else if (step === 'enrich') {
      setStep('review');
    }
  };

  const goBack = () => {
    if (step === 'review') setStep('enrich');
    else if (step === 'enrich') setStep('mapping');
    // Do mapeamento volta para a tela de arquivo SEM apagar o que já foi
    // configurado: quem só quer conferir o arquivo escolhido não perde o
    // mapeamento. Trocar o arquivo refaz o mapeamento naturalmente (handleFile).
    else if (step === 'mapping') setStep('upload');
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar contatos</DialogTitle>
          <DialogDescription>
            {result
              ? 'Resultado da importação.'
              : 'Suba uma planilha CSV ou Excel e associe as colunas aos campos do contato.'}
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="flex items-center gap-2 pb-2">
            {STEPS.map((s, index) => (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                    index < currentStepIndex && 'bg-primary text-primary-foreground',
                    index === currentStepIndex && 'bg-primary text-primary-foreground',
                    index > currentStepIndex && 'bg-muted text-muted-foreground',
                  )}
                >
                  {index < currentStepIndex ? <Check className="h-3 w-3" /> : index + 1}
                </div>
                <span
                  className={cn(
                    'text-xs',
                    index === currentStepIndex ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
                {index < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {result ? (
            <ResultView result={result} />
          ) : step === 'upload' ? (
            <UploadStep
              isParsing={isParsing}
              fileInputRef={fileInputRef}
              onFile={handleFile}
              currentFileName={sheet ? fileName : ''}
              currentRowCount={sheet?.rows.length || 0}
            />
          ) : step === 'mapping' ? (
            <MappingStep
              sheet={sheet!}
              mapping={mapping}
              customFields={customFields}
              onChange={setMappingFor}
              newFieldForHeader={newFieldForHeader}
              setNewFieldForHeader={setNewFieldForHeader}
              newFieldLabel={newFieldLabel}
              setNewFieldLabel={setNewFieldLabel}
              onCreateField={handleCreateField}
              isCreatingField={createCustomField.isPending}
            />
          ) : step === 'enrich' ? (
            <EnrichStep
              tags={tags}
              selectedTagIds={selectedTagIds}
              setSelectedTagIds={setSelectedTagIds}
              customFields={customFields}
              mapping={mapping}
              commonCustom={commonCustom}
              setCommonCustom={setCommonCustom}
              workspaceId={workspaceId}
              setWorkspaceId={setWorkspaceId}
              workspaces={availableWorkspaces}
              newFieldLabel={newFieldLabel}
              setNewFieldLabel={setNewFieldLabel}
              onCreateField={handleCreateField}
              isCreatingField={createCustomField.isPending}
            />
          ) : (
            <ReviewStep
              fileName={fileName}
              totalRows={preparedRows.length}
              validCount={validRows.length}
              invalidCount={invalidCount}
              tagCount={selectedTagIds.length}
              workspaceName={
                workspaceId === NO_WORKSPACE
                  ? 'Nenhum'
                  : availableWorkspaces.find((w) => w.id === workspaceId)?.name || '—'
              }
              rows={validRows}
              isImporting={isImporting}
              progress={progress}
            />
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {result ? (
            <Button className="ml-auto" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={goBack}
                disabled={step === 'upload' || isImporting}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              {step === 'review' ? (
                <Button onClick={handleImport} disabled={isImporting || validRows.length === 0}>
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando…
                    </>
                  ) : (
                    <>
                      Importar {validRows.length} contato{validRows.length === 1 ? '' : 's'}
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={goNext} disabled={!sheet}>
                  Continuar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function UploadStep({
  isParsing,
  fileInputRef,
  onFile,
  currentFileName,
  currentRowCount,
}: {
  isParsing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File | undefined) => void;
  /** Arquivo já lido, quando o usuário voltou do passo de mapeamento. */
  currentFileName: string;
  currentRowCount: number;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="space-y-3">
      {currentFileName && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{currentFileName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {currentRowCount} linha(s)
          </span>
        </div>
      )}
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        onFile(event.dataTransfer.files?.[0]);
      }}
    >
      {isParsing ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Lendo a planilha…</p>
        </>
      ) : (
        <>
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {currentFileName ? 'Arraste outra planilha para substituir' : 'Arraste a planilha aqui'}
            </p>
            <p className="text-xs text-muted-foreground">Formatos aceitos: CSV, XLSX e XLS</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            {currentFileName ? 'Trocar arquivo' : 'Escolher arquivo'}
          </Button>
          <p className="text-xs text-muted-foreground">
            A primeira linha do arquivo deve conter os nomes das colunas.
          </p>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
    </div>
    </div>
  );
}

function MappingStep({
  sheet,
  mapping,
  customFields,
  onChange,
  newFieldForHeader,
  setNewFieldForHeader,
  newFieldLabel,
  setNewFieldLabel,
  onCreateField,
  isCreatingField,
}: {
  sheet: ParsedSheet;
  mapping: Record<string, string>;
  customFields: ContactCustomField[];
  onChange: (header: string, target: string) => void;
  newFieldForHeader: string | null;
  setNewFieldForHeader: (header: string | null) => void;
  newFieldLabel: string;
  setNewFieldLabel: (label: string) => void;
  onCreateField: (label: string, header: string | null) => Promise<boolean>;
  isCreatingField: boolean;
}) {
  const hasPhone = Object.values(mapping).includes('phone');

  return (
    <div className="space-y-3">
      {!hasPhone && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>Escolha qual coluna contém o <strong>telefone</strong> para continuar.</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {sheet.rows.length} linha(s) encontrada(s). Colunas não associadas serão ignoradas.
      </p>

      <div className="space-y-2">
        {sheet.headers.map((header) => {
          const sample = sheet.rows.find((row) => row[header])?.[header] || '';
          return (
            <div key={header} className="rounded-md border p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{header}</p>
                  {sample && (
                    <p className="truncate text-xs text-muted-foreground">ex: {sample}</p>
                  )}
                </div>
                <Select
                  value={mapping[header] || IGNORE}
                  onValueChange={(value) => {
                    if (value === '__new__') {
                      setNewFieldForHeader(header);
                      setNewFieldLabel(header);
                      return;
                    }
                    onChange(header, value);
                  }}
                >
                  <SelectTrigger className="w-52 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={IGNORE}>Não importar</SelectItem>
                    {FIXED_TARGETS.map((target) => (
                      <SelectItem key={target.value} value={target.value}>
                        {target.label}
                      </SelectItem>
                    ))}
                    {customFields.map((field) => (
                      <SelectItem key={field.id} value={field.key}>
                        {field.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Criar campo…</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newFieldForHeader === header && (
                <div className="mt-3 flex items-end gap-2 border-t pt-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Nome do novo campo</Label>
                    <Input
                      value={newFieldLabel}
                      onChange={(event) => setNewFieldLabel(event.target.value)}
                      placeholder="Ex: Mensagem personalizada"
                      autoFocus
                    />
                    {newFieldLabel.trim() && (
                      <p className="text-xs text-muted-foreground">
                        No fluxo:{' '}
                        <code className="rounded bg-muted px-1">
                          {`{{${slugifyFieldKey(newFieldLabel)}}}`}
                        </code>
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onCreateField(newFieldLabel, header)}
                    disabled={isCreatingField || !newFieldLabel.trim()}
                  >
                    {isCreatingField ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewFieldForHeader(null);
                      setNewFieldLabel('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnrichStep({
  tags,
  selectedTagIds,
  setSelectedTagIds,
  customFields,
  mapping,
  commonCustom,
  setCommonCustom,
  workspaceId,
  setWorkspaceId,
  workspaces,
  newFieldLabel,
  setNewFieldLabel,
  onCreateField,
  isCreatingField,
}: {
  tags: Array<{ id: string; name: string; color: string }>;
  selectedTagIds: string[];
  setSelectedTagIds: (ids: string[]) => void;
  customFields: ContactCustomField[];
  mapping: Record<string, string>;
  commonCustom: Record<string, string>;
  setCommonCustom: (values: Record<string, string>) => void;
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  workspaces: Array<{ id: string; name: string }>;
  newFieldLabel: string;
  setNewFieldLabel: (label: string) => void;
  onCreateField: (label: string, header: string | null) => Promise<boolean>;
  isCreatingField: boolean;
}) {
  const [showNewField, setShowNewField] = useState(false);
  const mappedKeys = new Set(Object.values(mapping));
  // Campos que já vêm de uma coluna não entram aqui: um valor fixo seria
  // sobrescrito pelo da linha e confundiria quem preenchesse.
  const availableForCommon = customFields.filter((field) => !mappedKeys.has(field.key));

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId],
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Workspace</Label>
        <Select value={workspaceId} onValueChange={setWorkspaceId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_WORKSPACE}>Nenhum workspace</SelectItem>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Contatos importados vão para este workspace. Contatos que já existem mantêm o workspace atual.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Tags aplicadas a todos os contatos</Label>
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma tag criada ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    isSelected ? 'border-transparent text-white' : 'hover:bg-muted',
                  )}
                  style={isSelected ? { backgroundColor: tag.color } : undefined}
                >
                  {isSelected && <Check className="mr-1 inline h-3 w-3" />}
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Valor fixo para todos</Label>
          <Button variant="ghost" size="sm" onClick={() => setShowNewField((prev) => !prev)}>
            <Plus className="mr-1 h-3 w-3" />
            Novo campo
          </Button>
        </div>

        {showNewField && (
          <div className="flex items-end gap-2 rounded-md border p-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Nome do campo</Label>
              <Input
                value={newFieldLabel}
                onChange={(event) => setNewFieldLabel(event.target.value)}
                placeholder="Ex: Origem"
                autoFocus
              />
              {newFieldLabel.trim() && (
                <p className="text-xs text-muted-foreground">
                  No fluxo:{' '}
                  <code className="rounded bg-muted px-1">
                    {`{{${slugifyFieldKey(newFieldLabel)}}}`}
                  </code>
                </p>
              )}
            </div>
            <Button
              size="sm"
              onClick={async () => {
                // Só fecha o formulário se o campo foi realmente criado; em erro
                // (ex.: chave duplicada) ele fica aberto para o usuário corrigir.
                const created = await onCreateField(newFieldLabel, null);
                if (created) setShowNewField(false);
              }}
              disabled={isCreatingField || !newFieldLabel.trim()}
            >
              {isCreatingField ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
            </Button>
          </div>
        )}

        {availableForCommon.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {customFields.length === 0
              ? 'Nenhum campo personalizado criado ainda.'
              : 'Todos os campos já estão associados a colunas da planilha.'}
          </p>
        ) : (
          <div className="space-y-2">
            {availableForCommon.map((field) => (
              <div key={field.id} className="space-y-1">
                <Label className="text-xs">
                  {field.label}{' '}
                  <code className="rounded bg-muted px-1 text-[10px]">{`{{${field.key}}}`}</code>
                </Label>
                <Textarea
                  rows={2}
                  value={commonCustom[field.key] || ''}
                  onChange={(event) =>
                    setCommonCustom({ ...commonCustom, [field.key]: event.target.value })
                  }
                  placeholder="Deixe vazio para não preencher"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  fileName,
  totalRows,
  validCount,
  invalidCount,
  tagCount,
  workspaceName,
  rows,
  isImporting,
  progress,
}: {
  fileName: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  tagCount: number;
  workspaceName: string;
  rows: ImportContactRow[];
  isImporting: boolean;
  progress: { processed: number; total: number };
}) {
  const preview = rows.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Arquivo" value={fileName} />
        <SummaryCard label="A importar" value={String(validCount)} />
        <SummaryCard
          label="Sem telefone válido"
          value={String(invalidCount)}
          variant={invalidCount > 0 ? 'warning' : undefined}
        />
        <SummaryCard label="Workspace" value={workspaceName} />
      </div>

      {invalidCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            {invalidCount} de {totalRows} linha(s) serão ignoradas por não ter um telefone válido.
          </span>
        </div>
      )}

      {tagCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {tagCount} tag(s) serão aplicadas a todos os contatos importados.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Contatos com telefone já cadastrado serão <strong>atualizados</strong>, não duplicados.
      </p>

      {isImporting && (
        <div className="space-y-1">
          <Progress value={progress.total ? (progress.processed / progress.total) * 100 : 0} />
          <p className="text-xs text-muted-foreground">
            {progress.processed} de {progress.total} processados…
          </p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="rounded-md border">
          <ScrollArea className="max-h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, index) => (
                  <TableRow key={`${row.phone}-${index}`}>
                    <TableCell className="font-mono text-xs">{row.phone}</TableCell>
                    <TableCell className="text-xs">{row.name || '—'}</TableCell>
                    <TableCell className="text-xs">{row.email || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          {rows.length > preview.length && (
            <p className="border-t p-2 text-center text-xs text-muted-foreground">
              e mais {rows.length - preview.length} contato(s)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ResultView({ result }: { result: ImportResult }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Criados" value={String(result.created)} />
        <SummaryCard label="Atualizados" value={String(result.updated)} />
        <SummaryCard
          label="Ignorados"
          value={String(result.skipped)}
          variant={result.skipped > 0 ? 'warning' : undefined}
        />
      </div>

      {result.errors.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Linhas com erro</p>
          <ScrollArea className="max-h-48 rounded-md border">
            <div className="divide-y">
              {result.errors.map((error, index) => (
                <div key={`${error.phone}-${index}`} className="flex items-start gap-2 p-2 text-xs">
                  <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                  <span className="font-mono">{error.phone || '(sem telefone)'}</span>
                  <span className="text-muted-foreground">{error.error}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        variant === 'warning' && 'border-amber-500/40 bg-amber-500/5',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}
