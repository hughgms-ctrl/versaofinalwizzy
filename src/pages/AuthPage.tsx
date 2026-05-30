import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Building, User, Mail, Lock, Globe } from 'lucide-react';
import wizzyLogo from '@/assets/wizzy-logo.png';

type AuthMode = 'auth' | 'forgot' | 'reset';

export default function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, resetPassword, verifyRecoveryToken, updatePassword } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingRecovery, setIsVerifyingRecovery] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'reset' ? 'reset' : 'auth';
  });
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    fullName: '',
    companyName: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
  });

  useEffect(() => {
    if (!authLoading && user && authMode !== 'reset') {
      navigate('/dashboard');
    }
  }, [user, authLoading, authMode, navigate]);

  useEffect(() => {
    if (authMode !== 'reset' || recoveryReady) return;

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');

    if (!tokenHash) {
      setRecoveryReady(true);
      return;
    }

    let cancelled = false;

    const verifyToken = async () => {
      setIsVerifyingRecovery(true);
      const { error } = await verifyRecoveryToken(tokenHash);

      if (cancelled) return;

      if (error) {
        toast({
          title: 'Link invalido ou expirado',
          description: 'Solicite um novo link de recuperacao de senha.',
          variant: 'destructive',
        });
        setAuthMode('forgot');
      } else {
        setRecoveryReady(true);
        window.history.replaceState({}, document.title, '/auth?mode=reset');
      }

      setIsVerifyingRecovery(false);
    };

    verifyToken();

    return () => {
      cancelled = true;
    };
  }, [authMode, recoveryReady, toast, verifyRecoveryToken]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(loginData.email, loginData.password);

    if (error) {
      toast({
        title: 'Erro ao entrar',
        description: error.message === 'Invalid login credentials'
          ? 'Email ou senha incorretos'
          : error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Bem-vindo!',
        description: 'Login realizado com sucesso.',
      });
      navigate('/dashboard');
    }

    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);

    const { error } = await signInWithGoogle();

    if (error) {
      toast({
        title: 'Erro ao entrar com Google',
        description: error.message,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await resetPassword(resetEmail);

    if (error) {
      toast({
        title: 'Erro ao enviar recuperacao',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Link enviado',
        description: 'Enviamos um link para redefinir sua senha.',
      });
      setAuthMode('auth');
      setResetEmail('');
    }

    setIsLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'Use pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Senhas diferentes',
        description: 'A confirmacao precisa ser igual a nova senha.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    const { error } = await updatePassword(newPassword);

    if (error) {
      toast({
        title: 'Erro ao atualizar senha',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Senha atualizada',
        description: 'Sua nova senha ja esta ativa.',
      });
      navigate('/dashboard');
    }

    setIsLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registerData.fullName || !registerData.companyName) {
      toast({
        title: 'Campos obrigatorios',
        description: 'Preencha todos os campos.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(
      registerData.email,
      registerData.password,
      registerData.fullName,
      registerData.companyName,
      registerData.timezone
    );

    if (error) {
      toast({
        title: 'Erro ao criar conta',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Conta criada!',
        description: 'Sua conta foi criada com sucesso. Voce ja pode usar o sistema.',
      });
      navigate('/dashboard');
    }

    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isVerifyingRecovery) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src={wizzyLogo}
            alt="Wizzy"
            className="h-20 w-20 mx-auto mb-4 rounded-2xl shadow-lg"
          />
          <h1 className="text-2xl font-bold text-foreground">Wizzy</h1>
          <p className="text-muted-foreground mt-2">Gestao inteligente de conversas</p>
        </div>

        <Card className="bg-card border-border">
          {authMode === 'forgot' ? (
            <>
              <CardHeader className="pb-4">
                <Button type="button" variant="ghost" className="mb-2 w-fit px-2" onClick={() => setAuthMode('auth')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Recuperar senha</h2>
                  <p className="text-sm text-muted-foreground mt-1">Informe seu e-mail para receber o link de redefinicao.</p>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-10"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      'Enviar link'
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : authMode === 'reset' ? (
            <>
              <CardHeader className="pb-4">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Criar nova senha</h2>
                  <p className="text-sm text-muted-foreground mt-1">Digite uma senha nova para acessar sua conta.</p>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nova senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="Minimo 6 caracteres"
                        className="pl-10"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Repita a nova senha"
                        className="pl-10"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Atualizar senha'
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <Tabs defaultValue="login" className="w-full">
              <CardHeader className="pb-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="register">Criar Conta</TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent>
                <TabsContent value="login" className="mt-0">
                  <div className="space-y-4">
                    <Button type="button" variant="outline" className="w-full" disabled={isLoading} onClick={handleGoogleLogin}>
                      <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold">G</span>
                      Entrar com Google
                    </Button>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      ou
                      <span className="h-px flex-1 bg-border" />
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="login-email"
                            type="email"
                            placeholder="seu@email.com"
                            className="pl-10"
                            value={loginData.email}
                            onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="login-password">Senha</Label>
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => {
                              setResetEmail(loginData.email);
                              setAuthMode('forgot');
                            }}
                          >
                            Esqueci minha senha
                          </Button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="login-password"
                            type="password"
                            placeholder="********"
                            className="pl-10"
                            value={loginData.password}
                            onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                            required
                          />
                        </div>
                      </div>

                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Entrando...
                          </>
                        ) : (
                          'Entrar'
                        )}
                      </Button>
                    </form>
                  </div>
                </TabsContent>

                <TabsContent value="register" className="mt-0">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Seu Nome</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="register-name"
                          type="text"
                          placeholder="Joao Silva"
                          className="pl-10"
                          value={registerData.fullName}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, fullName: e.target.value }))}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-company">Nome da Empresa</Label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="register-company"
                          type="text"
                          placeholder="Minha Empresa Ltda"
                          className="pl-10"
                          value={registerData.companyName}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, companyName: e.target.value }))}
                          required
                        />
                      </div>
                     </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-timezone">Fuso Horario</Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                        <Select
                          value={registerData.timezone}
                          onValueChange={(value) => setRegisterData(prev => ({ ...prev, timezone: value }))}
                        >
                          <SelectTrigger className="pl-10">
                            <SelectValue placeholder="Selecione o fuso horario" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/Sao_Paulo">Sao Paulo (GMT-3)</SelectItem>
                            <SelectItem value="America/Fortaleza">Fortaleza (GMT-3)</SelectItem>
                            <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                            <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                            <SelectItem value="America/Noronha">Fernando de Noronha (GMT-2)</SelectItem>
                            <SelectItem value="America/New_York">New York (GMT-5)</SelectItem>
                            <SelectItem value="America/Chicago">Chicago (GMT-6)</SelectItem>
                            <SelectItem value="America/Los_Angeles">Los Angeles (GMT-8)</SelectItem>
                            <SelectItem value="Europe/London">Londres (GMT+0)</SelectItem>
                            <SelectItem value="Europe/Lisbon">Lisboa (GMT+0)</SelectItem>
                            <SelectItem value="Europe/Madrid">Madrid (GMT+1)</SelectItem>
                            <SelectItem value="Asia/Tokyo">Toquio (GMT+9)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="register-email"
                          type="email"
                          placeholder="seu@email.com"
                          className="pl-10"
                          value={registerData.email}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="register-password"
                          type="password"
                          placeholder="Minimo 6 caracteres"
                          className="pl-10"
                          value={registerData.password}
                          onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                          minLength={6}
                          required
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Criando conta...
                        </>
                      ) : (
                        'Criar Conta'
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </CardContent>
            </Tabs>
          )}
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Ao continuar, voce concorda com nossos Termos de Uso e Politica de Privacidade.
        </p>
      </div>
    </div>
  );
}
