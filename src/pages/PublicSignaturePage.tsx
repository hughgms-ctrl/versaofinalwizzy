import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { 
  FileText, RotateCcw, Check, Loader2, AlertCircle, Camera, 
  Shield, Mail, KeyRound, ChevronRight, Eye, Download, User, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Step = 'loading' | 'error' | 'review' | 'otp_send' | 'otp_verify' | 'selfie' | 'signature' | 'submitting' | 'done';

async function extractEdgeFunctionError(error: any): Promise<string> {
  const fallback = error?.message || 'Erro inesperado';

  try {
    const context = error?.context;

    if (context && typeof context.json === 'function') {
      const payload = await context.json();
      if (payload?.error) return payload.error;
      if (payload?.message) return payload.message;
    }

    if (context && typeof context.text === 'function') {
      const raw = await context.text();
      if (!raw) return fallback;

      try {
        const parsed = JSON.parse(raw);
        return parsed?.error || parsed?.message || fallback;
      } catch {
        return raw;
      }
    }
  } catch {
    // ignore parse errors and keep fallback
  }

  return fallback;
}

export default function PublicSignaturePage() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<Step>('loading');
  const [documentData, setDocumentData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Config from metadata
  const [requireSelfie, setRequireSelfie] = useState(true);
  const [otpChannel, setOtpChannel] = useState<'email' | 'whatsapp'>('email');
  const [otpChannels, setOtpChannels] = useState<Array<'email' | 'whatsapp'>>(['email']);

  // OTP state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Selfie state
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Signature state
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<any>(null);
  const [geolocation, setGeolocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  useEffect(() => {
    loadDocument();
  }, [token]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraStream]);

  const loadDocument = async () => {
    if (!token) {
      setError('Token inválido');
      setStep('error');
      return;
    }

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('signature-load-document', {
        body: { signatureToken: token },
      });

      if (fetchError) {
        throw new Error(await extractEdgeFunctionError(fetchError));
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const signatureData = data?.signature;

      if (!signatureData) {
        setError('Documento não encontrado ou link expirado');
        setStep('error');
        return;
      }

      if (signatureData.status === 'signed') {
        setError('Este documento já foi assinado');
        setStep('error');
        return;
      }

      setDocumentData(signatureData);
      
      // Read config from metadata
      const meta = signatureData.metadata || {};
      const selfieRequired = meta.require_selfie !== false; // default true
      const channels: Array<'email' | 'whatsapp'> = Array.isArray(meta.otp_channels) && meta.otp_channels.length > 0
        ? meta.otp_channels
        : [meta.otp_channel || 'email'];
      const primaryChannel = channels[0];
      setRequireSelfie(selfieRequired);
      setOtpChannel(primaryChannel);
      setOtpChannels(channels);

      if (signatureData.signing_method === 'internal') {
        setOtpEmail(signatureData.signer_email || '');
        setStep('review');
      } else {
        setStep('review');
      }
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Erro ao carregar documento');
      setStep('error');
    }
  };

  // ==================== OTP ====================
  const handleSendOtp = async () => {
    if (otpChannels.includes('email') && !otpEmail) {
      toast.error('Informe seu e-mail');
      return;
    }
    setOtpSending(true);
    try {
      const body: any = {
        signatureToken: token,
        // 'all' tells the backend to use every channel saved in metadata
        channel: otpChannels.length > 1 ? 'all' : otpChannels[0],
      };
      if (otpChannels.includes('email')) body.email = otpEmail;

      const { data, error } = await supabase.functions.invoke('signature-send-otp', { body });
      if (error) throw new Error(await extractEdgeFunctionError(error));
      if (data?.error) throw new Error(data.error);

      setOtpSent(true);
      setStep('otp_verify');
      toast.success(data?.message || 'Código enviado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar código');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Informe o código de 6 dígitos');
      return;
    }
    setOtpVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('signature-verify-otp', {
        body: { signatureToken: token, code: otpCode },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error));
      if (data?.error) throw new Error(data.error);
      
      if (data?.verified) {
        toast.success('Identidade verificada!');
        // Skip selfie if not required
        if (requireSelfie) {
          setStep('selfie');
          setTimeout(() => {
            void startCamera();
          }, 150);
        } else {
          setStep('signature');
        }
      } else {
        toast.error('Código inválido');
      }
    } catch (err: any) {
      toast.error(err.message || 'Código inválido ou expirado');
    } finally {
      setOtpVerifying(false);
    }
  };

  // ==================== Selfie ====================
  const attachStreamToVideo = async (stream: MediaStream) => {
    // Wait for the <video> element to be mounted (cameraActive triggers render)
    for (let i = 0; i < 30; i++) {
      if (videoRef.current) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true;
    (video as any).playsInline = true;
    try {
      await video.play();
    } catch {
      // Some browsers require an explicit gesture; ignore
    }
    // Wait until video has real dimensions before allowing capture
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('playing', onReady);
          resolve();
        };
        video.addEventListener('loadedmetadata', onReady);
        video.addEventListener('playing', onReady);
        // Safety timeout
        setTimeout(onReady, 2000);
      });
    }
  };

  const startCamera = async () => {
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Seu navegador não suporta captura de câmera. Use o envio pela galeria.');
      return;
    }

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      setCameraStream(stream);
      setCameraActive(true);
      // Attach asynchronously so React mounts the <video> first
      void attachStreamToVideo(stream);
    } catch (err) {
      setCameraError('Não foi possível abrir a câmera. Você pode continuar enviando uma foto da galeria.');
      toast.error('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  };

  const captureSelfie = async () => {
    const video = videoRef.current;
    if (!video) {
      toast.error('Câmera não está pronta. Tente novamente.');
      return;
    }

    // Make sure the video actually has frames before capturing
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      // Wait briefly for metadata
      await new Promise<void>((resolve) => {
        const onReady = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('playing', onReady);
          resolve();
        };
        video.addEventListener('loadedmetadata', onReady);
        video.addEventListener('playing', onReady);
        setTimeout(onReady, 1500);
      });
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      toast.error('A câmera ainda não está pronta. Aguarde um instante e tente novamente.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    // Use JPEG to keep payload reasonable and ensure non-empty bytes
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Sanity check: a real photo should be well over a few KB
    if (!dataUrl || dataUrl.length < 5000) {
      toast.error('Não foi possível capturar a imagem. Tente novamente.');
      return;
    }

    setSelfieImage(dataUrl);

    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const handleSelfieFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelfieImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const retakeSelfie = () => {
    setSelfieImage(null);
    startCamera();
  };

  // ==================== Signature Pad ====================
  const [hasStrokes, setHasStrokes] = useState(false);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    // White background so the exported PNG is opaque (avoids invisible stamp on PDFs)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (step === 'signature') {
      setTimeout(initCanvas, 100);
      window.addEventListener('resize', initCanvas);
      return () => window.removeEventListener('resize', initCanvas);
    }
  }, [step, initCanvas]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasStrokes) setHasStrokes(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current && hasStrokes) {
      setSignatureImage(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setSignatureImage(null);
    setHasStrokes(false);
  };

  // ==================== Submit ====================
  const handleSubmit = async () => {
    if (!signatureImage) return;
    if (requireSelfie && !selfieImage) return;
    setStep('submitting');

    try {
      const { data, error } = await supabase.functions.invoke('signature-complete', {
        body: {
          signatureToken: token,
          selfieImage: selfieImage || null,
          signatureImage,
          signerDevice: navigator.userAgent,
          requireSelfie,
        },
      });

      if (error) throw new Error(await extractEdgeFunctionError(error));
      if (data?.error) throw new Error(data.error);

      setResult(data);
      setStep('done');
      toast.success('Documento assinado com sucesso!');
    } catch (err: any) {
      console.error('Error submitting:', err);
      toast.error(err.message || 'Erro ao finalizar assinatura');
      setStep('signature');
    }
  };

  // ==================== Progress ====================
  const activeSteps = [
    { key: 'review', label: 'Documento', icon: FileText },
    { key: 'otp', label: 'Verificação', icon: KeyRound },
    ...(requireSelfie ? [{ key: 'selfie', label: 'Selfie', icon: Camera }] : []),
    { key: 'signature', label: 'Assinatura', icon: User },
  ];

  const currentStepIndex = step === 'review' ? 0 
    : (step === 'otp_send' || step === 'otp_verify') ? 1 
    : step === 'selfie' ? 2 
    : (step === 'signature' || step === 'submitting') ? (requireSelfie ? 3 : 2) 
    : activeSteps.length;

  // ==================== Render ====================
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Carregando documento...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h1 className="text-xl font-semibold mb-2">Ops!</h1>
          <p className="text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 max-w-md text-center">
          <div className="h-16 w-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Assinatura Concluída!</h1>
          <p className="text-muted-foreground mb-4">
            Seu documento foi assinado com sucesso conforme Lei 14.063/2020.
          </p>
          
          <div className="text-left bg-muted/50 rounded-lg p-4 text-xs space-y-1 mb-4">
            <p><strong>Hash SHA-256:</strong></p>
            <p className="font-mono break-all">{result?.documentHash || 'N/A'}</p>
            <p className="mt-2"><strong>Assinado em:</strong> {result?.signedAt ? new Date(result.signedAt).toLocaleString('pt-BR') : 'N/A'}</p>
          </div>

          <div className="flex gap-2 justify-center">
            {result?.receiptPdfUrl && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={result.receiptPdfUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" /> Comprovante
                </a>
              </Button>
            )}
          </div>

          <Badge variant="default" className="mt-4 gap-1">
            <Shield className="h-3 w-3" /> Assinatura Eletrônica Avançada
          </Badge>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Assinatura Eletrônica Avançada</span>
          </div>
          <Badge variant="secondary" className="text-[10px]">Lei 14.063/2020</Badge>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-6">
          {activeSteps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === currentStepIndex;
            const isDone = i < currentStepIndex;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className={`flex items-center gap-1.5 ${isActive ? 'text-primary' : isDone ? 'text-green-600' : 'text-muted-foreground'}`}>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive ? 'bg-primary text-primary-foreground' : isDone ? 'bg-green-100 text-green-700' : 'bg-muted'
                  }`}>
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className="text-[11px] font-medium hidden sm:inline">{s.label}</span>
                </div>
                {i < activeSteps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i < currentStepIndex ? 'bg-green-400' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Review Document(s) */}
        {step === 'review' && (() => {
          const packDocs = documentData?.pack?.documents as Array<{ id: string; name: string; pdf_url: string | null }> | undefined;
          const isPack = Array.isArray(packDocs) && packDocs.length > 0;
          const docsToShow = isPack
            ? packDocs!
            : documentData?.generated_document
              ? [documentData.generated_document]
              : [];

          return (
            <div className="space-y-4">
              {isPack && (
                <Card className="p-4 border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h2 className="font-semibold text-sm">
                        {documentData?.pack?.name || 'Pacote de documentos'}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {docsToShow.length} {docsToShow.length === 1 ? 'documento' : 'documentos'} para revisar e assinar
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {docsToShow.map((d, idx) => (
                <Card key={d.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {isPack && (
                          <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                        )}
                        {d.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">Revise o documento abaixo antes de prosseguir</p>
                    </div>
                    {d.pdf_url && (
                      <Button size="sm" variant="ghost" asChild className="gap-1 shrink-0">
                        <a href={d.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Abrir</span>
                        </a>
                      </Button>
                    )}
                  </div>
                  {d.pdf_url ? (
                    <div className="border rounded-lg overflow-hidden bg-muted">
                      <iframe
                        src={`${d.pdf_url}#toolbar=1&view=FitH`}
                        className="w-full h-[600px]"
                        title={d.name}
                      />
                    </div>
                  ) : (
                    <div className="border rounded-lg p-6 text-center text-xs text-muted-foreground space-y-2">
                      <p>O documento ainda está sendo preparado.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadDocument()}
                        className="gap-2"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Atualizar
                      </Button>
                    </div>
                  )}
                </Card>
              ))}

              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Signatário</p>
                <p className="font-medium text-sm">
                  {documentData?.signer_name || 'Não informado'}
                </p>
                {documentData?.signer_email && (
                  <p className="text-xs text-muted-foreground">{documentData.signer_email}</p>
                )}
                {documentData?.signer_phone && (
                  <p className="text-xs text-muted-foreground">{documentData.signer_phone}</p>
                )}
              </Card>

              <Button
                onClick={() => setStep(documentData?.signing_method === 'internal' ? 'otp_send' : 'signature')}
                className="w-full gap-2"
                size="lg"
              >
                {isPack
                  ? `Li e concordo com ${docsToShow.length === 1 ? 'o documento' : `os ${docsToShow.length} documentos`}`
                  : 'Li e concordo com o documento'}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          );
        })()}

        {/* Step 2: OTP Verification */}
        {(step === 'otp_send' || step === 'otp_verify') && (
          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  {otpChannels.length > 1 ? (
                    <Shield className="h-5 w-5 text-primary" />
                  ) : otpChannel === 'whatsapp' ? (
                    <MessageSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Mail className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div>
                  <h2 className="font-semibold">Verificação de Identidade</h2>
                  <p className="text-xs text-muted-foreground">
                    {otpChannels.length > 1
                      ? `Enviaremos o código por ${otpChannels.map(c => c === 'whatsapp' ? 'WhatsApp' : 'e-mail').join(' e ')}`
                      : otpChannel === 'whatsapp'
                        ? 'Enviaremos um código para seu WhatsApp'
                        : 'Enviaremos um código para seu e-mail'}
                  </p>
                </div>
              </div>

              {!otpSent ? (
                <div className="space-y-3">
                  {otpChannels.includes('email') && (
                    <div>
                      <label className="text-sm font-medium">E-mail</label>
                      <Input
                        type="email"
                        value={otpEmail}
                        onChange={e => setOtpEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="mt-1"
                        disabled={!!documentData?.signer_email}
                      />
                      {documentData?.signer_email && (
                        <p className="text-[10px] text-muted-foreground mt-1">E-mail pré-definido pelo remetente</p>
                      )}
                    </div>
                  )}
                  {otpChannels.includes('whatsapp') && (
                    <div>
                      <label className="text-sm font-medium">WhatsApp</label>
                      <Input
                        type="tel"
                        value={documentData?.signer_phone || ''}
                        disabled
                        className="mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Número pré-definido pelo remetente</p>
                    </div>
                  )}
                  <Button
                    onClick={handleSendOtp}
                    disabled={otpSending || (otpChannels.includes('email') && !otpEmail)}
                    className="w-full gap-2"
                  >
                    {otpSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    {otpChannels.length > 1
                      ? 'Enviar Código (e-mail + WhatsApp)'
                      : otpChannel === 'whatsapp' ? 'Enviar Código via WhatsApp' : 'Enviar Código por E-mail'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Código enviado {otpChannels.length > 1
                      ? `por ${otpChannels.map(c => c === 'whatsapp' ? 'WhatsApp' : 'e-mail').join(' e ')}. Use qualquer um dos códigos.`
                      : otpChannel === 'whatsapp'
                        ? 'via WhatsApp'
                        : <>para <strong>{otpEmail.replace(/(.{2}).*(@.*)/, "$1***$2")}</strong></>}
                  </p>
                  <div>
                    <label className="text-sm font-medium">Código de 6 dígitos</label>
                    <Input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="mt-1 text-center text-2xl tracking-[0.5em] font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setOtpSent(false); setOtpCode(''); }} className="flex-1">
                      Reenviar
                    </Button>
                    <Button onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6} className="flex-1 gap-2">
                      {otpVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Verificar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Step 3: Selfie (only if required) */}
        {step === 'selfie' && requireSelfie && (
          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Registro de Selfie</h2>
                  <p className="text-xs text-muted-foreground">Tire uma foto para comprovar sua identidade</p>
                </div>
              </div>

              {!selfieImage ? (
                <div className="space-y-3">
                  {cameraActive ? (
                    <div className="relative">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full rounded-lg border"
                      />
                      <Button
                        onClick={captureSelfie}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 gap-2"
                      >
                        <Camera className="h-4 w-4" /> Capturar
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button onClick={startCamera} className="w-full gap-2" variant="outline">
                        <Camera className="h-4 w-4" /> Abrir Câmera
                      </Button>
                      {cameraError && (
                        <p className="text-xs text-muted-foreground text-center">{cameraError}</p>
                      )}
                      <div className="relative">
                        <div className="text-center text-xs text-muted-foreground py-2">ou</div>
                        <label className="block">
                          <Button variant="outline" className="w-full gap-2" asChild>
                            <span>
                              <Eye className="h-4 w-4" /> Enviar foto da galeria
                              <input
                                type="file"
                                accept="image/*"
                                capture="user"
                                className="sr-only"
                                onChange={handleSelfieFileUpload}
                              />
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      Confira a foto. Se não estiver boa, exclua e tire outra.
                    </p>
                    <div className="relative">
                      <img
                        src={selfieImage}
                        alt="Selfie capturada"
                        className="w-full rounded-lg border bg-white"
                      />
                      <Badge className="absolute top-2 right-2 gap-1" variant="secondary">
                        <Check className="h-3 w-3" /> Capturada
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="destructive"
                      onClick={retakeSelfie}
                      className="flex-1 gap-2"
                    >
                      <RotateCcw className="h-4 w-4" /> Excluir e tirar outra
                    </Button>
                    <Button onClick={() => setStep('signature')} className="flex-1 gap-2">
                      Confirmar foto <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Step 4: Signature */}
        {(step === 'signature' || step === 'submitting') && (
          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="font-medium mb-3">Sua assinatura</h2>
              <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full h-40 cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Use o mouse ou dedo para assinar
              </p>
            </Card>

            {/* Summary */}
            <Card className="p-4 bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">RESUMO DA ASSINATURA</h3>
              <div className="space-y-1 text-xs">
                <p><strong>Documento:</strong> {documentData?.generated_document?.name}</p>
                <p><strong>Signatário:</strong> {documentData?.signer_name || 'N/A'}</p>
                <p>
                  <strong>Verificação:</strong> OTP por {otpChannels.length > 1
                    ? otpChannels.map(c => c === 'whatsapp' ? 'WhatsApp' : 'e-mail').join(' + ')
                    : (otpChannel === 'whatsapp' ? 'WhatsApp' : 'e-mail')} ✅
                </p>
                {requireSelfie && (
                  <div className="pt-1">
                    <p className="mb-1.5"><strong>Selfie:</strong> {selfieImage ? '✅ Capturada' : '⏳ Pendente'}</p>
                    {selfieImage && (
                      <div className="flex items-center gap-2">
                        <img
                          src={selfieImage}
                          alt="Selfie capturada"
                          className="h-20 w-20 rounded-lg border border-border object-cover"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-[11px] h-7"
                          onClick={() => { setSelfieImage(null); setStep('selfie'); setTimeout(() => void startCamera(), 150); }}
                        >
                          <RotateCcw className="h-3 w-3" /> Refazer
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                <p className="pt-1"><strong>Método:</strong> Assinatura Eletrônica Avançada (Lei 14.063/2020)</p>
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={clearCanvas} className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" /> Limpar
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={!signatureImage || step === 'submitting' || (requireSelfie && !selfieImage)}
                className="flex-1"
              >
                {step === 'submitting' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Assinar Documento
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Ao assinar, você declara que leu e concorda com o documento. Esta assinatura eletrônica é válida 
              conforme MP 2.200-2/2001 e Lei 14.063/2020. Serão registrados: hash SHA-256 do documento, 
              {requireSelfie ? ' selfie,' : ''} IP, data/hora e dispositivo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
