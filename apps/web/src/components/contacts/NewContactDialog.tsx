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

    const phoneDigits = phone.replace(/\D/g, '');
    const isPhoneValid = phoneDigits.length >= 8 && phoneDigits.length <= 15;

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^\d+\s()-]/g, '');
        setPhone(value);
    };

    const handleCreate = async () => {
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length < 8 || cleanPhone.length > 15) {
            alert('Telefone invalido. Use o formato internacional com codigo do pais, ex: +1 415 555 2671.');
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
                        Adicione um novo contato a sua base. O telefone e obrigatorio.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="phone">Telefone (obrigatorio)</Label>
                        <Input
                            id="phone"
                            placeholder="+1 415 555 2671"
                            value={phone}
                            onChange={handlePhoneChange}
                            autoComplete="off"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Use o codigo do pais para numeros internacionais, ex: +55, +1, +351.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name">Nome (opcional)</Label>
                        <Input
                            id="name"
                            placeholder="Ex: Joao Silva"
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
                        disabled={!phone.trim() || !isPhoneValid || createContact.isPending}
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
