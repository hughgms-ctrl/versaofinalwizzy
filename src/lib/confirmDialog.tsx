import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmRequest {
  message: string;
  options: ConfirmDialogOptions;
  resolve: (value: boolean) => void;
}

let showRequest: ((req: ConfirmRequest) => void) | null = null;

// Substitui window.confirm() -- o Chrome, depois de ver vários popups nativos
// seguidos na mesma aba, passa a suprimir silenciosamente os próximos
// (confirm() volta `false` sem mostrar nada, sem erro nenhum -- ver conversa
// com o usuário: "clico em excluir e não acontece nada, sem nenhum aviso").
// Esse diálogo é renderizado pelo próprio React via <ConfirmDialogHost />
// (montado uma vez em App.tsx), então não sofre desse problema. Uso: `if
// (await confirmDialog('Tem certeza?')) { ... }`, dá pra chamar de qualquer
// lugar (inclusive dentro de uma mutationFn), igual o confirm() nativo.
export function confirmDialog(message: string, options: ConfirmDialogOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!showRequest) {
      console.error('confirmDialog chamado sem <ConfirmDialogHost /> montado -- veja App.tsx');
      resolve(false);
      return;
    }
    showRequest({ message, options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    showRequest = (req) => setRequest(req);
    return () => {
      showRequest = null;
    };
  }, []);

  const close = (result: boolean) => {
    request?.resolve(result);
    setRequest(null);
  };

  return (
    <AlertDialog open={!!request} onOpenChange={(open) => { if (!open) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.options.title || 'Tem certeza?'}</AlertDialogTitle>
          <AlertDialogDescription>{request?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {request?.options.cancelLabel || 'Cancelar'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={request?.options.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {request?.options.confirmLabel || 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
