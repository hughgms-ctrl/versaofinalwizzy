import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMasterPrompts, useCreateMasterPrompt, useDeleteMasterPrompt, MasterPrompt } from '@/hooks/useMasterPrompts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, FileText, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function MasterPromptListItem({ prompt }: { prompt: MasterPrompt }) {
  const navigate = useNavigate();
  const deletePrompt = useDeleteMasterPrompt();

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={() => navigate(`/master-agent/${prompt.id}`)}
    >
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-primary flex items-center justify-center shadow-sm shrink-0">
        <FileText className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{prompt.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className="text-[10px]">{prompt.niche || 'Sem nicho'}</Badge>
          <Badge variant={prompt.is_active ? 'default' : 'secondary'} className="text-[10px]">
            {prompt.is_active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
        onClick={(e) => { e.stopPropagation(); deletePrompt.mutate(prompt.id); }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function MasterPromptsTab() {
  const { data: prompts = [], isLoading } = useMasterPrompts();
  const createPrompt = useCreateMasterPrompt();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNiche, setNewNiche] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPrompt.mutate({ name: newName, niche: newNiche, content: '' }, {
      onSuccess: () => { setOpen(false); setNewName(''); setNewNiche(''); },
    });
  };

  if (isLoading) return <div className="text-muted-foreground text-sm">Carregando...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted-foreground">
          {prompts.length} agente{prompts.length !== 1 ? 's' : ''} master
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Agente Master</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Agente Master</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Nome</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex.: Direito à Saúde" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nicho</label>
                <Input value={newNiche} onChange={e => setNewNiche(e.target.value)} placeholder="Ex.: direito_saude" />
              </div>
              <Button onClick={handleCreate} disabled={!newName.trim() || createPrompt.isPending} className="w-full">
                Criar Agente Master
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {prompts.map(prompt => (
          <MasterPromptListItem key={prompt.id} prompt={prompt} />
        ))}
      </div>
    </div>
  );
}
