import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { MOCK_CLIENTS } from '@/data/legalDashboardMock';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAdCostDialog({ open, onOpenChange }: Props) {
  const [amount, setAmount] = useState('');
  const [campaign, setCampaign] = useState('');
  const [clientId, setClientId] = useState('all');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!amount || !campaign) {
      toast.error('Preencha valor e campanha');
      return;
    }
    toast.success('Custo de anúncio registrado (mock)', {
      description: 'A persistência real será habilitada na Fase 2.',
    });
    setAmount('');
    setCampaign('');
    setClientId('all');
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar custo de Ads</DialogTitle>
          <DialogDescription>
            Lançamento manual. Em breve, a integração com Meta Ads importa automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign">Campanha</Label>
              <Input
                id="campaign"
                placeholder="Ex.: Cível — Out/25"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vincular ao cliente / caso</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOCK_CLIENTS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
          >
            Salvar custo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
