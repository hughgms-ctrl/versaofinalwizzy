import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Plus, UserPlus } from 'lucide-react';
import { useCreateContact } from '@/hooks/useContacts';

interface NewContactDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onContactCreated?: (contact: any) => void;
}

export function NewContactDialog({ open, onOpenChange, onContactCreated }: NewContactDialogProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const createContact = useCreateContact();

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Only allow numbers, plus sign and spaces
        const value = e.target.value.replace(/[^\d+\s]/g, '');
        setPhone(value);
    };

    const handleCreate = async () => {
        // Clean phone number: remove non-digits, ensuring country code pattern
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length < 10) {
            alert('Telefone inválido. Digite no formato: DD + Número (ex: 11999999999)');
            return;
        }

        try {
            const contact = await createContact.mutateAsync({
                name: name.trim() || null,
                phone: cleanPhone,
            });

            onOpenChange(false);
            setName('');
            setPhone('');

            if (onContactCreated && contact) {
                onContactCreated(contact);
            }
        } catch (error) {
            // Error handled by hook toast
            console.error(error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <UserPlus className="h-5 w-5 text-primary" />
                        </div>
                    </div>
                    <DialogTitle>Novo Contato</DialogTitle>
                    <DialogDescription>
                        Adicione um novo contato à sua base. O telefone é obrigatório.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="phone">Telefone (obrigatório)</Label>
                        <Input
                            id="phone"
                            placeholder="(11) 99999-9999"
                            value={phone}
                            onChange={handlePhoneChange}
                            autoComplete="off"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Apenas números com DDD. Codigo do Brasil (55) não é obrigatório para números nacionais.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name">Nome (opcional)</Label>
                        <Input
                            id="name"
                            placeholder="Ex: João Silva"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!phone.trim() || phone.replace(/\D/g, '').length < 10 || createContact.isPending}
                        className="gap-2"
                    >
                        {createContact.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4" />
                        )}
                        Salvar Contato
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
