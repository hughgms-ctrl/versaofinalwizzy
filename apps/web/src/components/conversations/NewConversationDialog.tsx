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
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { useCreateConversation } from '@/hooks/useConversations';
import { toast } from '@/hooks/use-toast';

interface NewConversationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConversationCreated?: (conversation: any) => void;
}

export function NewConversationDialog({ open, onOpenChange, onConversationCreated }: NewConversationDialogProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const createConversation = useCreateConversation();

    const phoneDigits = phone.replace(/\D/g, '');
    const isPhoneValid = phoneDigits.length >= 8 && phoneDigits.length <= 15;

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^\d+\s()-]/g, '');
        setPhone(value);
    };

    const handleCreate = async () => {
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length < 8 || cleanPhone.length > 15) {
            toast({
                title: "Telefone invalido",
                description: "Use o formato internacional com codigo do pais, ex: +1 415 555 2671.",
                variant: "destructive"
            });
            return;
        }

        try {
            const result = await createConversation.mutateAsync({
                name: name.trim() || null,
                phone: cleanPhone,
            });

            onOpenChange(false);
            setName('');
            setPhone('');

            if (onConversationCreated && result?.conversation) {
                onConversationCreated(result.conversation);
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
                            <MessageSquarePlus className="h-5 w-5 text-primary" />
                        </div>
                    </div>
                    <DialogTitle>Nova Conversa</DialogTitle>
                    <DialogDescription>
                        Inicie um atendimento com um novo numero de telefone.
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
                        disabled={!phone.trim() || !isPhoneValid || createConversation.isPending}
                        className="gap-2"
                    >
                        {createConversation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <MessageSquarePlus className="h-4 w-4" />
                        )}
                        Iniciar Conversa
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
