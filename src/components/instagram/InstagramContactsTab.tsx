import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Link2,
  Link2Off,
  Loader2,
  MessageCircle,
  Search,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  isWindowOpen,
  useInstagramContacts,
  useLinkInstagramContact,
  type InstagramContact,
} from '@/hooks/useInstagramContacts';
import { useContacts } from '@/hooks/useContacts';

/**
 * Os contatos que o Instagram trouxe.
 *
 * Tela própria, e não a aba Contatos da Wizzy: `contacts.phone` é NOT NULL — a
 * lista de contatos da Wizzy é uma lista de telefones, e um perfil do Instagram
 * pode nunca revelar um. Misturar exigiria telefone falso (que contaminaria
 * disparo de WhatsApp, deduplicação e pipeline) ou afrouxar a coluna mais usada
 * do produto.
 *
 * O que a tela acrescenta em relação a uma lista qualquer é a coluna de
 * ALCANCE: quem respondeu nas últimas 24h pode receber mensagem hoje, quem não
 * respondeu só volta a ser alcançável se escrever de novo. É a regra da Meta, e
 * é o que explica por que um disparo para 2.000 contatos chega a 80.
 */

type Filter = 'all' | 'reachable' | 'with_email' | 'linked';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'reachable', label: 'Alcançáveis agora' },
  { key: 'with_email', label: 'Com e-mail' },
  { key: 'linked', label: 'Vinculados' },
];

function Avatar({ contact }: { contact: InstagramContact }) {
  return contact.profile_pic_url ? (
    <img src={contact.profile_pic_url} alt="" className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-xs font-semibold text-white">
      {(contact.username || contact.name || '?').slice(0, 1).toUpperCase()}
    </div>
  );
}

/**
 * Etiqueta de alcance, com a explicação junto — é a coluna que gera dúvida.
 *
 * O estado é carregado por um ponto colorido, e não pelo texto: o verde do
 * `status-open` sobre superfície clara não alcança 4.5:1 em corpo pequeno, e
 * texto colorido ilegível é o preço mais comum que se paga por "deixar bonito".
 * O ponto colore sem depender de contraste de leitura.
 */
function ReachBadge({ contact }: { contact: InstagramContact }) {
  const open = isWindowOpen(contact);
  const lastInbound = contact.instagram_conversations?.[0]?.last_inbound_at;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default items-center gap-1.5 whitespace-nowrap text-sm">
            <span
              aria-hidden
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                open ? 'bg-status-open' : 'bg-muted-foreground/40',
              )}
            />
            <span className={open ? undefined : 'text-muted-foreground'}>
              {open ? 'alcançável' : 'fora da janela'}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          {open ? (
            <>
              Respondeu em{' '}
              {lastInbound ? new Date(lastInbound).toLocaleString('pt-BR') : '—'}. O
              Instagram permite mandar DM até 24h depois da última mensagem da pessoa.
            </>
          ) : (
            <>
              {lastInbound
                ? `Última mensagem dela em ${new Date(lastInbound).toLocaleString('pt-BR')}.`
                : 'Nunca escreveu para você.'}{' '}
              Fora da janela de 24h o Instagram não entrega DM — só volta a ser
              alcançável se escrever de novo, ou por resposta a um comentário.
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Escolhe o contato da Wizzy que é a mesma pessoa. */
function LinkDialog({
  contact,
  onClose,
}: {
  contact: InstagramContact | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const { data: wizzyContacts = [], isLoading } = useContacts();
  const link = useLinkInstagramContact();

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? wizzyContacts.filter((c: any) =>
          (c.name || '').toLowerCase().includes(term) || (c.phone || '').includes(term))
      : wizzyContacts;
    return list.slice(0, 30);
  }, [wizzyContacts, search]);

  const apply = async (contactId: string | null) => {
    if (!contact) return;
    try {
      await link.mutateAsync({ instagramContactId: contact.id, contactId });
      toast({ title: contactId ? 'Contatos vinculados' : 'Vínculo desfeito' });
      onClose();
    } catch (error: any) {
      toast({ title: 'Erro ao vincular', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Vincular @{contact?.username || contact?.name || 'perfil'}
          </DialogTitle>
          <DialogDescription>
            Escolha o contato da Wizzy que é a mesma pessoa. A Wizzy não faz isso
            sozinha: dois cadastros com o mesmo nome não provam ser o mesmo humano,
            e unir os errados só aparece quando a mensagem vai para quem não devia.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone"
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : !matches.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum contato encontrado.
            </p>
          ) : (
            matches.map((c: any) => (
              <button
                key={c.id}
                type="button"
                onClick={() => apply(c.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md border p-2.5 text-left text-sm transition hover:border-primary',
                  contact?.linked_contact_id === c.id && 'border-primary bg-primary/5',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name || 'Sem nome'}</span>
                  <span className="text-xs text-muted-foreground">{c.phone}</span>
                </span>
                {contact?.linked_contact_id === c.id && (
                  <Badge variant="secondary" className="shrink-0">atual</Badge>
                )}
              </button>
            ))
          )}
        </div>

        {contact?.linked_contact_id && (
          <Button variant="outline" onClick={() => apply(null)} className="gap-2">
            <Link2Off className="h-4 w-4" />
            Desfazer vínculo
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InstagramContactsTab({ connectedAccounts }: { connectedAccounts: number }) {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading } = useInstagramContacts();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [linking, setLinking] = useState<InstagramContact | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (term
        && !(c.username || '').toLowerCase().includes(term)
        && !(c.name || '').toLowerCase().includes(term)
        && !(c.email || '').toLowerCase().includes(term)) return false;

      if (filter === 'reachable') return isWindowOpen(c);
      if (filter === 'with_email') return !!c.email;
      if (filter === 'linked') return !!c.linked_contact_id;
      return true;
    });
  }, [contacts, search, filter]);

  const reachable = useMemo(() => contacts.filter(isWindowOpen).length, [contacts]);

  if (connectedAccounts === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Conecte uma conta do Instagram em Configurações para ver os contatos.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {contacts.length.toLocaleString('pt-BR')}{' '}
          {contacts.length === 1 ? 'contato' : 'contatos'} do Instagram ·{' '}
          <span className="font-medium text-foreground">{reachable}</span> alcançáveis agora
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por @, nome ou e-mail"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            // O estado ativo vem da borda e do fundo, não da cor do texto: o
            // magenta da marca em 12px não chega aos 4.5:1 exigidos, e um
            // filtro que não se lê não é um filtro.
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors duration-150',
              filter === f.key
                ? 'border-primary bg-primary/10 font-medium text-foreground'
                : 'text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !visible.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Users className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {contacts.length
                ? 'Nenhum contato com esse filtro.'
                : 'Ninguém interagiu com a conta ainda. Os contatos aparecem aqui quando alguém comenta ou manda mensagem.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Etiquetas</TableHead>
                  <TableHead>Alcance</TableHead>
                  <TableHead>Contato da Wizzy</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((contact) => {
                  const conversation = contact.instagram_conversations?.[0];
                  const tags = (contact.instagram_contact_tags || [])
                    .map((t) => t.tags)
                    .filter(Boolean);

                  return (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar contact={contact} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              @{contact.username || contact.igsid}
                            </p>
                            {contact.name && (
                              <p className="truncate text-xs text-muted-foreground">{contact.name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-sm">
                        {contact.email || <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {tags.length ? tags.map((tag: any) => (
                            <Badge
                              key={tag.id}
                              variant="outline"
                              className="font-normal"
                              style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                            >
                              {tag.name}
                            </Badge>
                          )) : <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>

                      <TableCell><ReachBadge contact={contact} /></TableCell>

                      <TableCell className="text-sm">
                        {contact.contacts ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {contact.contacts.name || contact.contacts.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Vincular a um contato da Wizzy"
                            onClick={() => setLinking(contact)}
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Abrir conversa"
                            disabled={!conversation}
                            onClick={() => navigate('/conversations')}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <LinkDialog contact={linking} onClose={() => setLinking(null)} />
    </div>
  );
}
