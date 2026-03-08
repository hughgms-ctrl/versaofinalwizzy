import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUserRole } from '@/hooks/useUserPermissions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Camera, Loader2, Save, User, Lock, Mail, CreditCard, Phone } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function ProfilePage() {
  const { profile, session } = useAuth();
  const { data: userRole, isLoading: roleLoading } = useCurrentUserRole();
  const queryClient = useQueryClient();
  
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Check if user is workspace owner (can manage subscriptions)
  const isWorkspaceOwner = userRole === 'owner';

  // Update fullName when profile loads
  useEffect(() => {
    if (profile?.full_name && !fullName) {
      setFullName(profile.full_name);
    }
  }, [profile?.full_name]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim() || !profile) return;
    
    setIsUpdatingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', profile.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: 'Perfil atualizado',
        description: 'Suas informações foram salvas com sucesso.',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha a nova senha e a confirmação.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Senhas não coincidem',
        description: 'A nova senha e a confirmação devem ser iguais.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      toast({
        title: 'Senha alterada',
        description: 'Sua senha foi atualizada com sucesso.',
      });
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast({
        title: 'Erro ao alterar senha',
        description: error.message || 'Não foi possível alterar a senha.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Arquivo inválido',
        description: 'Por favor, selecione uma imagem.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'A imagem deve ter no máximo 2MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `avatars/${profile.id}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: 'Foto atualizada',
        description: 'Sua foto de perfil foi alterada com sucesso.',
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        title: 'Erro ao enviar foto',
        description: 'Não foi possível atualizar sua foto.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <MainLayout title="Meu Perfil" subtitle="Gerencie suas informações pessoais">
      <div className="max-w-3xl mx-auto py-4 md:py-8 px-2 md:px-4 space-y-6 md:space-y-8">

        {/* Profile Photo */}
        <Card>
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <User className="h-4 w-4 md:h-5 md:w-5" />
              Foto de Perfil
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Esta foto será exibida nas conversas e para outros membros da equipe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center gap-4 md:gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20 md:h-24 md:w-24">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-primary-foreground text-xl md:text-2xl font-semibold">
                  {getInitials(profile?.full_name || 'U')}
                </AvatarFallback>
              </Avatar>
              <label 
                htmlFor="photo-upload"
                className="absolute bottom-0 right-0 h-7 w-7 md:h-8 md:w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5 md:h-4 md:w-4" />
                )}
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
                disabled={isUploadingPhoto}
              />
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-sm font-medium">Alterar foto</p>
              <p className="text-xs text-muted-foreground">JPG, PNG ou GIF. Máximo 2MB.</p>
            </div>
          </CardContent>
        </Card>

        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input 
                id="email"
                value={session?.user?.email || ''} 
                disabled 
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O e-mail não pode ser alterado.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input 
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>
            <Button 
              onClick={handleUpdateProfile}
              disabled={isUpdatingProfile || fullName.trim() === profile?.full_name}
            >
              {isUpdatingProfile ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Alterações
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Alterar Senha
            </CardTitle>
            <CardDescription>
              Mantenha sua conta segura com uma senha forte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <Input 
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <Input 
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>
            <Button 
              onClick={handleUpdatePassword}
              disabled={isUpdatingPassword || !newPassword || !confirmPassword}
              variant="secondary"
            >
              {isUpdatingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Alterando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Alterar Senha
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Subscription - Only for workspace owners */}
        {isWorkspaceOwner && (
          <Card>
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <CreditCard className="h-4 w-4 md:h-5 md:w-5" />
                Assinatura
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Gerencie o plano do workspace e métodos de pagamento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 rounded-lg p-4 md:p-6 text-center">
                <div className="inline-flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 mb-4">
                  <CreditCard className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-2 text-sm md:text-base">Em breve</h4>
                <p className="text-xs md:text-sm text-muted-foreground">
                  A gestão de assinaturas estará disponível em breve.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
