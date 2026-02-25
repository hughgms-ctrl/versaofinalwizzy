import { useState } from 'react';
import { Widget } from '@/hooks/useWidgets';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, Download, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface WidgetCodeGeneratorProps {
  widget: Widget;
  widgetId: string;
}

export function WidgetCodeGenerator({ widget, widgetId }: WidgetCodeGeneratorProps) {
  const [copied, setCopied] = useState<string | null>(null);

  // Generate the endpoint URL
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const endpointUrl = `${supabaseUrl}/functions/v1/widget-submit`;

  const generateScriptCode = () => {
    return `<!-- Wizzy Widget - ${widget.name || 'Widget'} -->
<script>
(function() {
  var widgetId = "${widgetId}";
  var config = ${JSON.stringify({
    buttonText: widget.button_text,
    buttonColor: widget.button_color,
    buttonTextColor: widget.button_text_color,
    buttonSize: widget.button_size,
    buttonPosition: widget.button_position,
    buttonBorderRadius: widget.button_border_radius,
    formTitle: widget.form_title,
    formSubtitle: widget.form_subtitle,
    formBackgroundColor: widget.form_background_color,
    formTextColor: widget.form_text_color,
    formAccentColor: widget.form_accent_color,
    fieldNameEnabled: widget.field_name_enabled,
    fieldNameRequired: widget.field_name_required,
    fieldEmailEnabled: widget.field_email_enabled,
    fieldEmailRequired: widget.field_email_required,
    fieldCpfEnabled: widget.field_cpf_enabled,
    fieldCpfRequired: widget.field_cpf_required,
    fieldWhatsappRequired: widget.field_whatsapp_required,
    successMessage: widget.success_message,
    successRedirectUrl: widget.success_redirect_url,
    pixelEnabled: widget.pixel_enabled,
    pixelEventName: widget.pixel_event_name,
  }, null, 2)};
  
  var endpoint = "${endpointUrl}";
  
  // Create styles
  var style = document.createElement('style');
  style.textContent = \`
    .wizzy-widget-btn {
      position: fixed;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      border: none;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 500;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .wizzy-widget-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    }
    .wizzy-widget-btn svg {
      width: 20px;
      height: 20px;
    }
    .wizzy-widget-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .wizzy-widget-form {
      width: 100%;
      max-width: 400px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .wizzy-widget-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 16px;
      border-bottom: 1px solid rgba(0,0,0,0.1);
    }
    .wizzy-widget-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      opacity: 0.7;
    }
    .wizzy-widget-close:hover { opacity: 1; }
    .wizzy-widget-body {
      padding: 16px;
    }
    .wizzy-widget-field {
      margin-bottom: 12px;
    }
    .wizzy-widget-field label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .wizzy-widget-field input,
    .wizzy-widget-field textarea,
    .wizzy-widget-field select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
    }
    .wizzy-widget-field input:focus,
    .wizzy-widget-field textarea:focus,
    .wizzy-widget-field select:focus {
      outline: none;
      border-color: \${config.formAccentColor};
      box-shadow: 0 0 0 3px \${config.formAccentColor}20;
    }
    .wizzy-widget-submit {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: opacity 0.2s;
    }
    .wizzy-widget-submit:hover { opacity: 0.9; }
    .wizzy-widget-submit:disabled { opacity: 0.6; cursor: not-allowed; }
    .wizzy-widget-success {
      text-align: center;
      padding: 32px 16px;
    }
    .wizzy-widget-success svg {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
    }
    .wizzy-required { color: #ef4444; }
  \`;
  document.head.appendChild(style);
  
  // Create button
  var btn = document.createElement('button');
  btn.className = 'wizzy-widget-btn';
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>' + config.buttonText;
  btn.style.backgroundColor = config.buttonColor;
  btn.style.color = config.buttonTextColor;
  btn.style.borderRadius = config.buttonBorderRadius + 'px';
  btn.style.padding = config.buttonSize === 'small' ? '8px 16px' : config.buttonSize === 'large' ? '16px 24px' : '12px 20px';
  btn.style.fontSize = config.buttonSize === 'small' ? '14px' : config.buttonSize === 'large' ? '18px' : '16px';
  
  if (config.buttonPosition === 'bottom-right') {
    btn.style.bottom = '20px';
    btn.style.right = '20px';
  } else if (config.buttonPosition === 'bottom-left') {
    btn.style.bottom = '20px';
    btn.style.left = '20px';
  } else if (config.buttonPosition === 'bottom-center') {
    btn.style.bottom = '20px';
    btn.style.left = '50%';
    btn.style.transform = 'translateX(-50%)';
  }
  
  document.body.appendChild(btn);
  
  // Form HTML
  function createForm() {
    var overlay = document.createElement('div');
    overlay.className = 'wizzy-widget-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    
    var form = document.createElement('div');
    form.className = 'wizzy-widget-form';
    form.style.backgroundColor = config.formBackgroundColor;
    form.style.color = config.formTextColor;
    
    var html = '<div class="wizzy-widget-header"><div>';
    html += '<h3 style="margin:0;font-size:18px;font-weight:600">' + config.formTitle + '</h3>';
    if (config.formSubtitle) html += '<p style="margin:4px 0 0;font-size:14px;opacity:0.7">' + config.formSubtitle + '</p>';
    html += '</div><button class="wizzy-widget-close" onclick="this.closest(\\'.wizzy-widget-overlay\\').remove()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
    
    html += '<div class="wizzy-widget-body"><form id="wizzy-form">';
    
    if (config.fieldNameEnabled) {
      html += '<div class="wizzy-widget-field"><label>Nome ' + (config.fieldNameRequired ? '<span class="wizzy-required">*</span>' : '') + '</label>';
      html += '<input type="text" name="name" placeholder="Seu nome"' + (config.fieldNameRequired ? ' required' : '') + '></div>';
    }
    
    if (config.fieldEmailEnabled) {
      html += '<div class="wizzy-widget-field"><label>Email ' + (config.fieldEmailRequired ? '<span class="wizzy-required">*</span>' : '') + '</label>';
      html += '<input type="email" name="email" placeholder="seu@email.com"' + (config.fieldEmailRequired ? ' required' : '') + '></div>';
    }
    
    if (config.fieldCpfEnabled) {
      html += '<div class="wizzy-widget-field"><label>CPF ' + (config.fieldCpfRequired ? '<span class="wizzy-required">*</span>' : '') + '</label>';
      html += '<input type="text" name="cpf" placeholder="000.000.000-00"' + (config.fieldCpfRequired ? ' required' : '') + '></div>';
    }
    
    html += '<div class="wizzy-widget-field"><label>WhatsApp ' + (config.fieldWhatsappRequired ? '<span class="wizzy-required">*</span>' : '') + '</label>';
    html += '<input type="tel" name="whatsapp" placeholder="(00) 00000-0000"' + (config.fieldWhatsappRequired ? ' required' : '') + '></div>';
    
    html += '<button type="submit" class="wizzy-widget-submit" style="background-color:' + config.formAccentColor + '">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>Enviar</button>';
    html += '</form></div>';
    
    form.innerHTML = html;
    overlay.appendChild(form);
    document.body.appendChild(overlay);
    
    // Form submit
    document.getElementById('wizzy-form').onsubmit = function(e) {
      e.preventDefault();
      var submitBtn = form.querySelector('.wizzy-widget-submit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Enviando...';
      
      var formData = new FormData(e.target);
      var data = {
        widget_id: widgetId,
        name: formData.get('name') || null,
        email: formData.get('email') || null,
        cpf: formData.get('cpf') || null,
        whatsapp: formData.get('whatsapp'),
        page_url: window.location.href,
        referrer_url: document.referrer || null
      };
      
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(res) { return res.json(); })
      .then(function(result) {
        if (result.success) {
          // Fire pixel event
          if (config.pixelEnabled && config.pixelEventName) {
            if (typeof fbq !== 'undefined') fbq('track', config.pixelEventName);
            if (typeof gtag !== 'undefined') gtag('event', config.pixelEventName);
            if (typeof dataLayer !== 'undefined') dataLayer.push({ event: config.pixelEventName });
          }
          
          // Show success
          form.querySelector('.wizzy-widget-body').innerHTML = '<div class="wizzy-widget-success"><svg viewBox="0 0 24 24" fill="none" stroke="' + config.formAccentColor + '" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg><p style="font-weight:500">' + config.successMessage + '</p></div>';
          
          // Redirect or close
          setTimeout(function() {
            if (config.successRedirectUrl) {
              window.location.href = config.successRedirectUrl;
            } else {
              overlay.remove();
            }
          }, 2000);
        } else {
          alert('Erro ao enviar. Tente novamente.');
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>Enviar';
        }
      })
      .catch(function() {
        alert('Erro ao enviar. Tente novamente.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>Enviar';
      });
    };
  }
  
  btn.onclick = createForm;
})();
</script>
<!-- End Wizzy Widget -->`;
  };

  const generateIframeCode = () => {
    return `<!-- Wizzy Widget Iframe - ${widget.name || 'Widget'} -->
<iframe 
  src="${window.location.origin}/widget-embed/${widgetId}" 
  style="border: none; width: 100%; height: 500px;"
  title="Formulário de Contato"
></iframe>`;
  };

  const handleCopy = async (code: string, type: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(type);
    toast({
      title: 'Copiado!',
      description: 'Código copiado para a área de transferência.',
    });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (code: string, filename: string) => {
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scriptCode = generateScriptCode();
  const iframeCode = generateIframeCode();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Código para Embed</CardTitle>
        <CardDescription>
          Copie o código e cole no seu site WordPress ou qualquer outra página HTML
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="script">
          <TabsList className="mb-4">
            <TabsTrigger value="script">Script (Recomendado)</TabsTrigger>
            <TabsTrigger value="iframe">Iframe</TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="space-y-4">
            <div className="relative">
              <pre className="p-4 bg-muted rounded-lg overflow-auto max-h-96 text-xs font-mono">
                {scriptCode}
              </pre>
              <div className="absolute top-2 right-2 flex gap-2">
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => handleCopy(scriptCode, 'script')}
                >
                  {copied === 'script' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => handleDownload(scriptCode, `widget-${widgetId}.html`)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Cole este código antes do {`</body>`} do seu site. O widget aparecerá automaticamente.
            </p>
          </TabsContent>

          <TabsContent value="iframe" className="space-y-4">
            <div className="relative">
              <pre className="p-4 bg-muted rounded-lg overflow-auto text-xs font-mono">
                {iframeCode}
              </pre>
              <div className="absolute top-2 right-2">
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => handleCopy(iframeCode, 'iframe')}
                >
                  {copied === 'iframe' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Use iframe para incorporar o widget em uma área específica da página.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
