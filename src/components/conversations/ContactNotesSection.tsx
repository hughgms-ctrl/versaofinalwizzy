import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Plus, 
  Loader2, 
  Trash2, 
  Edit2, 
  Save, 
  X,
  StickyNote,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { 
  useContactNotes, 
  useAddContactNote, 
  useUpdateContactNote, 
  useDeleteContactNote,
  ContactNote 
} from '@/hooks/useContactNotes';

interface ContactNotesSectionProps {
  contactId: string;
}

export function ContactNotesSection({ contactId }: ContactNotesSectionProps) {
  const { data: notes, isLoading } = useContactNotes(contactId);
  const addNote = useAddContactNote();
  const updateNote = useUpdateContactNote();
  const deleteNote = useDeleteContactNote();

  const [isAdding, setIsAdding] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    
    await addNote.mutateAsync({
      contactId,
      content: newNoteContent.trim(),
    });
    
    setNewNoteContent('');
    setIsAdding(false);
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editContent.trim()) return;
    
    await updateNote.mutateAsync({
      noteId,
      content: editContent.trim(),
      contactId,
    });
    
    setEditingNoteId(null);
    setEditContent('');
  };

  const handleDeleteNote = async () => {
    if (!deleteNoteId) return;
    
    await deleteNote.mutateAsync({
      noteId: deleteNoteId,
      contactId,
    });
    
    setDeleteNoteId(null);
  };

  const startEditing = (note: ContactNote) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button 
          className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <StickyNote className="h-3.5 w-3.5" />
          <span>Notas de Atendimento</span>
          {notes && notes.length > 0 && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
              {notes.length}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
        {!isAdding && isExpanded && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Nova
          </Button>
        )}
      </div>

      {isExpanded && (
        <>
          {/* Add New Note */}
          {isAdding && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
              <Textarea
                placeholder="Escreva uma nota sobre o atendimento, negociação, preferências do cliente..."
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                className="min-h-[80px] text-sm resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAdding(false);
                    setNewNoteContent('');
                  }}
                  disabled={addNote.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!newNoteContent.trim() || addNote.isPending}
                >
                  {addNote.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-3 w-3 mr-1" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Notes List */}
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : notes && notes.length > 0 ? (
            <div className="space-y-2">
              {notes.map((note) => (
                <div 
                  key={note.id} 
                  className="p-3 rounded-lg bg-muted/30 border border-border/50 group"
                >
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[80px] text-sm resize-none"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditContent('');
                          }}
                          disabled={updateNote.isPending}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateNote(note.id)}
                          disabled={!editContent.trim() || updateNote.isPending}
                        >
                          {updateNote.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Salvar'
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {note.content}
                      </p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                        <div className="flex items-center gap-2">
                          {note.profile && (
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={note.profile.avatar_url || undefined} />
                              <AvatarFallback className="text-[8px]">
                                {note.profile.full_name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {note.profile?.full_name || 'Usuário'} • {format(new Date(note.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => startEditing(note)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => setDeleteNoteId(note.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : !isAdding ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-2">
                Nenhuma nota adicionada
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar primeira nota
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteNoteId} onOpenChange={() => setDeleteNoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover nota?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A nota será permanentemente removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNote}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
