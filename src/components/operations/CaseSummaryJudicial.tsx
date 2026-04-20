import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCase } from '@/hooks/useOperationsCases';
import { useState, useEffect } from 'react';
import type { JudicialData } from '@/types/operations';

interface Props {
  caseId: string;
  data: JudicialData;
}

const ACTION_TYPES = ['Trabalhista', 'Cível', 'Previdenciário', 'Tributário', 'Família', 'Criminal', 'Outro'];

export function CaseSummaryJudicial({ caseId, data }: Props) {
  const [local, setLocal] = useState<JudicialData>(data || {});
  const update = useUpdateCase();

  useEffect(() => setLocal(data || {}), [data, caseId]);

  const save = () => {
    update.mutate({ id: caseId, judicial_data: local });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Número do processo (CNJ)</Label>
        <Input
          value={local.process_number || ''}
          onChange={(e) => setLocal({ ...local, process_number: e.target.value })}
          onBlur={save}
          placeholder="0000000-00.0000.0.00.0000"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Vara / Órgão julgador</Label>
          <Input value={local.court || ''} onChange={(e) => setLocal({ ...local, court: e.target.value })} onBlur={save} />
        </div>
        <div>
          <Label>Comarca</Label>
          <Input value={local.comarca || ''} onChange={(e) => setLocal({ ...local, comarca: e.target.value })} onBlur={save} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Autor(a)</Label>
          <Input value={local.plaintiff || ''} onChange={(e) => setLocal({ ...local, plaintiff: e.target.value })} onBlur={save} />
        </div>
        <div>
          <Label>Réu</Label>
          <Input value={local.defendant || ''} onChange={(e) => setLocal({ ...local, defendant: e.target.value })} onBlur={save} />
        </div>
      </div>
      <div>
        <Label>Tipo de ação</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={local.action_type || ''}
          onChange={(e) => {
            const v = e.target.value;
            setLocal({ ...local, action_type: v });
            update.mutate({ id: caseId, judicial_data: { ...local, action_type: v } });
          }}
        >
          <option value="">—</option>
          {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <Label>Observações</Label>
        <Textarea
          value={local.notes || ''}
          onChange={(e) => setLocal({ ...local, notes: e.target.value })}
          onBlur={save}
          rows={4}
        />
      </div>
    </div>
  );
}
