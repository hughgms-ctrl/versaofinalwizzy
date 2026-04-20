import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { useUpdateCaseTemplate } from '@/hooks/useCaseTemplates';
import type { JudicialData, AdministrativeData, CaseKind } from '@/types/operations';

const ACTION_TYPES = ['Trabalhista', 'Cível', 'Previdenciário', 'Tributário', 'Família', 'Criminal', 'Outro'];
const AGENCIES = ['INSS', 'Receita Federal', 'Detran', 'Prefeitura', 'INMETRO', 'Outro'];
const INSTANCES = ['Inicial', 'Recurso ordinário', 'Recurso especial', 'Última instância'];

interface Props {
  templateId: string;
  kind: CaseKind;
  judicial: JudicialData;
  administrative: AdministrativeData;
}

export function TemplateSummaryEditor({ templateId, kind, judicial, administrative }: Props) {
  const update = useUpdateCaseTemplate();
  const [j, setJ] = useState<JudicialData>(judicial || {});
  const [a, setA] = useState<AdministrativeData>(administrative || {});

  useEffect(() => { setJ(judicial || {}); }, [judicial, templateId]);
  useEffect(() => { setA(administrative || {}); }, [administrative, templateId]);

  const saveJ = (next?: JudicialData) =>
    update.mutate({ id: templateId, default_judicial_data: (next ?? j) as any });
  const saveA = (next?: AdministrativeData) =>
    update.mutate({ id: templateId, default_administrative_data: (next ?? a) as any });

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">Resumo padrão</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Esses valores serão pré-preenchidos ao criar um caso a partir deste template. Podem ser editados aqui a qualquer momento e também dentro de cada caso.
      </p>

      {kind === 'judicial' ? (
        <div className="space-y-3">
          <div>
            <Label>Número do processo (CNJ)</Label>
            <Input
              value={j.process_number || ''}
              onChange={(e) => setJ({ ...j, process_number: e.target.value })}
              onBlur={() => saveJ()}
              placeholder="0000000-00.0000.0.00.0000"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vara / Órgão julgador</Label>
              <Input value={j.court || ''} onChange={(e) => setJ({ ...j, court: e.target.value })} onBlur={() => saveJ()} />
            </div>
            <div>
              <Label>Comarca</Label>
              <Input value={j.comarca || ''} onChange={(e) => setJ({ ...j, comarca: e.target.value })} onBlur={() => saveJ()} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Autor(a)</Label>
              <Input value={j.plaintiff || ''} onChange={(e) => setJ({ ...j, plaintiff: e.target.value })} onBlur={() => saveJ()} />
            </div>
            <div>
              <Label>Réu</Label>
              <Input value={j.defendant || ''} onChange={(e) => setJ({ ...j, defendant: e.target.value })} onBlur={() => saveJ()} />
            </div>
          </div>
          <div>
            <Label>Tipo de ação</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={j.action_type || ''}
              onChange={(e) => {
                const next = { ...j, action_type: e.target.value };
                setJ(next);
                saveJ(next);
              }}
            >
              <option value="">—</option>
              {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={j.notes || ''} onChange={(e) => setJ({ ...j, notes: e.target.value })} onBlur={() => saveJ()} rows={3} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label>Órgão</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={a.agency || ''}
              onChange={(e) => {
                const next = { ...a, agency: e.target.value };
                setA(next);
                saveA(next);
              }}
            >
              <option value="">—</option>
              {AGENCIES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nº Protocolo</Label>
              <Input value={a.protocol_number || ''} onChange={(e) => setA({ ...a, protocol_number: e.target.value })} onBlur={() => saveA()} />
            </div>
            <div>
              <Label>Nº Benefício / NB</Label>
              <Input value={a.benefit_number || ''} onChange={(e) => setA({ ...a, benefit_number: e.target.value })} onBlur={() => saveA()} />
            </div>
          </div>
          <div>
            <Label>Tipo de procedimento</Label>
            <Input
              value={a.procedure_type || ''}
              onChange={(e) => setA({ ...a, procedure_type: e.target.value })}
              onBlur={() => saveA()}
              placeholder="Ex: Aposentadoria por idade, Auxílio-doença..."
            />
          </div>
          <div>
            <Label>Instância</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={a.instance || ''}
              onChange={(e) => {
                const next = { ...a, instance: e.target.value };
                setA(next);
                saveA(next);
              }}
            >
              <option value="">—</option>
              {INSTANCES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={a.notes || ''} onChange={(e) => setA({ ...a, notes: e.target.value })} onBlur={() => saveA()} rows={3} />
          </div>
        </div>
      )}
    </Card>
  );
}
