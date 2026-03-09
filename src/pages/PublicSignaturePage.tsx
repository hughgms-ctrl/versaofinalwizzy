import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, RotateCcw, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function PublicSignaturePage() {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documentData, setDocumentData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadDocument();
  }, [token]);

  const loadDocument = async () => {
    if (!token) {
      setError('Token inválido');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('document_signatures')
        .select(`
          *,
          generated_document:generated_documents(*)
        `)
        .eq('signature_token', token)
        .single();

      if (fetchError || !data) {
        setError('Documento não encontrado ou link expirado');
        return;
      }

      if (data.status === 'signed') {
        setError('Este documento já foi assinado');
        return;
      }

      setDocumentData(data);
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Erro ao carregar documento');
    } finally {
      setIsLoading(false);
    }
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    initCanvas();
    window.addEventListener('resize', initCanvas);
    return () => window.removeEventListener('resize', initCanvas);
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignature(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature(null);
  };

  const submitSignature = async () => {
    if (!signature || !documentData) return;

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.functions.invoke('capture-signature', {
        body: {
          signatureToken: token,
          signatureImage: signature,
        },
      });

      if (updateError) throw updateError;

      setSuccess(true);
      toast.success('Documento assinado com sucesso!');
    } catch (err) {
      console.error('Error submitting signature:', err);
      toast.error('Erro ao enviar assinatura');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 max-w-md text-center">
          <div className="h-16 w-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Assinatura recebida!</h1>
          <p className="text-muted-foreground">
            Seu documento foi assinado com sucesso. Você pode fechar esta página.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold">{documentData?.generated_document?.name || 'Documento'}</h1>
              <p className="text-xs text-muted-foreground">
                Assine abaixo para confirmar
              </p>
            </div>
          </div>
        </Card>

        {/* PDF Preview (if available) */}
        {documentData?.generated_document?.pdf_url && (
          <Card className="overflow-hidden">
            <div className="aspect-[3/4] bg-muted flex items-center justify-center">
              <iframe
                src={documentData.generated_document.pdf_url}
                className="w-full h-full"
                title="Preview do documento"
              />
            </div>
          </Card>
        )}

        {/* Signature Pad */}
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

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={clearCanvas} className="flex-1">
            <RotateCcw className="h-4 w-4 mr-2" />
            Limpar
          </Button>
          <Button 
            onClick={submitSignature} 
            disabled={!signature || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Confirmar Assinatura
          </Button>
        </div>

        {/* Legal notice */}
        <p className="text-xs text-muted-foreground text-center">
          Ao assinar, você concorda com os termos do documento e declara que todas as informações são verdadeiras.
        </p>
      </div>
    </div>
  );
}
