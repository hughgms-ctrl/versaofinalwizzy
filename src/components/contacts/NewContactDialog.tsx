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
import { PhoneNumberInput } from '@/components/shared/PhoneNumberInput';
import { DEFAULT_COUNTRY, toE164, validateNationalNumber, type Country } from '@/lib/countries';

interface NewContactDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onContactCreated?: (contact: any) => void;
}

export function NewContactDialog({ open, onOpenChange, onContactCreated }: NewContactDialogProps) {
    const [name, setName] = useState('');
    const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
    // Número NACIONAL (sem o código do país) -- o E.164 é montado na hora de salvar.
    const [phone, setPhone] = useState('');
    // Só aparece depois de tentar salvar: validar enquanto digita acusa erro em
    // número que ainda está pela metade.
    const [error, setError] = useState<string | null>(null);
    const createContact = useCreateContact();

    const handleCreate = async () => {
        const invalid = validateNationalNumber(country, phone);
        if (invalid) {
            setError(invalid);
            return;
        }
        setError(null);

        try {
            const contact = await createContact.mutateAsync({
                name: name.trim() || null,
                phone: toE164(country, phone),
                // Já vem com o código do país escolhido: o hook não deve chutar o 55.
                phoneIsE164: true,
            });

            onOpenChange(false);
            setName('');
            setPhone('');
            setCountry(DEFAULT_COUNTRY);

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
                        <PhoneNumberInput
                            id="phone"
                            country={country}
                            onCountryChange={(next) => {
                                setCountry(next);
                                setError(null);
                            }}
                            value={phone}
                            onChange={(value) => {
                                setPhone(value);
                                if (error) setError(null);
                            }}
                            onEnter={handleCreate}
                            placeholder={country.iso2 === 'br' ? '(11) 99999-9999' : 'Número sem o código do país'}
                        />
                        {error ? (
                            <p className="text-[11px] text-destructive">{error}</p>
                        ) : (
                            <p className="text-[10px] text-muted-foreground">
                                Escolha o país e digite o número sem o +{country.dialCode}. Colar o número
                                completo (ex: +1 415 555 0100) também funciona -- o país é reconhecido sozinho.
                            </p>
                        )}
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
                        disabled={!phone.trim() || createContact.isPending}
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
