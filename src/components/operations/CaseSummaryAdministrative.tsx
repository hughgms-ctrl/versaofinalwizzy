import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCase } from '@/hooks/useOperationsCases';
import { useState, useEffect } from 'react';
import type { AdministrativeData } from '@/types/operations';

interface Props {
  caseId: string;
  data: AdministrativeData;
}

const AGENCIES = ['INSS', 'Receita Federal', 'Detran', 'Prefeitura', 'INMETRO', 'Outro'];
const INSTANCES = ['Inicial', 'Recurso ordinário', 'Recurso especial', 'Última instância'];

export function CaseSummaryAdministrative({ caseId, data }: Props) {
  const [local, setLocal] = useState<AdministrativeData>(data || {});
  const update = useUpdateCase();

  useEffect(() => setLocal(data || {}), [data, caseId]);

  const save = () => update.mutate({ id: caseId, administrative_data: local });

  return (
    <div className="space-y-4">
      <div>
        <Label>Órgão</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={local.agency || ''}
          onChange={(e) => {
            const v = e.target.value;
            setLocal({ ...local, agency: v });
            update.mutate({ id: caseId, administrative_data: { ...local, agency: v } });
          }}
        >
          <option value="">—</option>
          {AGENCIES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Nº Protocolo</Label>
          <Input value={local.protocol_number || ''} onChange={(e) => setLocal({ ...local, protocol_number: e.target.value })} onBlur={save} />
        </div>
        <div>
          <Label>Nº Benefício / NB</Label>
          <Input value={local.benefit_number || ''} onChange={(e) => setLocal({ ...local, benefit_number: e.target.value })} onBlur={save} />
        </div>
      </div>
      <div>
        <Label>Tipo de procedimento</Label>
        <Input
          value={local.procedure_type || ''}
          onChange={(e) => setLocal({ ...local, procedure_type: e.target.value })}
          onBlur={save}
          placeholder="Ex: Aposentadoria por idade, Auxílio-doença..."
        />
      </div>
      <div>
        <Label>Instância</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={local.instance || ''}
          onChange={(e) => {
            const v = e.target.value;
            setLocal({ ...local, instance: v });
            update.mutate({ id: caseId, administrative_data: { ...local, instance: v } });
          }}
        >
          <option value="">—</option>
          {INSTANCES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>
      <div>
        <Label>Observações</Label>
        <Textarea value={local.notes || ''} onChange={(e) => setLocal({ ...local, notes: e.target.value })} onBlur={save} rows={4} />
      </div>
    </div>
  );
}
