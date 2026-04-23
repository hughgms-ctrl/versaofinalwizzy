import { User, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type FillMode = 'internal' | 'public';

interface FillModeStepProps {
  value: FillMode;
  onChange: (mode: FillMode) => void;
}

export function FillModeStep({ value, onChange }: FillModeStepProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card
        className={cn(
          'p-4 cursor-pointer transition-all border-2',
          value === 'internal'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        )}
        onClick={() => onChange('internal')}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
            value === 'internal' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}>
            <User className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm mb-1">Eu preencho agora</h4>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Você preenche todos os campos do contrato e depois envia para o(s) signatário(s) assinar.
            </p>
          </div>
        </div>
      </Card>

      <Card
        className={cn(
          'p-4 cursor-pointer transition-all border-2',
          value === 'public'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        )}
        onClick={() => onChange('public')}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
            value === 'public' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}>
            <Send className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm mb-1">Cliente preenche</h4>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Envie um link público. O cliente preenche os dados e depois o contrato segue para assinatura.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
