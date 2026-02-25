import { useState } from 'react';
import { Widget, WidgetCustomField } from '@/hooks/useWidgets';
import { MessageCircle, X, Send, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WidgetPreviewProps {
  widget: Partial<Widget>;
  customFields?: Partial<WidgetCustomField>[];
}

export function WidgetPreview({ widget, customFields = [] }: WidgetPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const sizeClasses = {
    small: 'text-sm px-4 py-2',
    medium: 'text-base px-5 py-3',
    large: 'text-lg px-6 py-4',
  };

  const handleSimulateSubmit = () => {
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      setIsOpen(false);
    }, 2000);
  };

  return (
    <div className="relative min-h-[400px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg overflow-hidden">
      {/* Simulated page content */}
      <div className="p-4 space-y-2">
        <div className="h-4 w-32 bg-gray-300 rounded" />
        <div className="h-3 w-48 bg-gray-300 rounded" />
        <div className="h-3 w-40 bg-gray-300 rounded" />
        <div className="h-20 bg-gray-300 rounded mt-4" />
      </div>

      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "absolute flex items-center gap-2 shadow-lg transition-all hover:scale-105",
            sizeClasses[widget.button_size as keyof typeof sizeClasses] || sizeClasses.medium,
            widget.button_position === 'bottom-left' && "bottom-4 left-4",
            widget.button_position === 'bottom-right' && "bottom-4 right-4",
            widget.button_position === 'bottom-center' && "bottom-4 left-1/2 -translate-x-1/2",
            widget.button_position === 'inline' && "relative mx-auto mt-4"
          )}
          style={{
            backgroundColor: widget.button_color || '#6366f1',
            color: widget.button_text_color || '#ffffff',
            borderRadius: `${widget.button_border_radius || 8}px`,
          }}
        >
          <MessageCircle className="h-5 w-5" />
          {widget.button_text || 'Fale Conosco'}
        </button>
      )}

      {/* Form Popup */}
      {isOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-sm rounded-lg shadow-xl overflow-hidden"
            style={{ 
              backgroundColor: widget.form_background_color || '#ffffff',
              color: widget.form_text_color || '#1f2937',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold">{widget.form_title || 'Entre em contato'}</h3>
                {widget.form_subtitle && (
                  <p className="text-sm opacity-70">{widget.form_subtitle}</p>
                )}
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-black/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {isSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle 
                    className="h-12 w-12 mx-auto mb-3"
                    style={{ color: widget.form_accent_color || '#6366f1' }}
                  />
                  <p className="font-medium">{widget.success_message || 'Obrigado!'}</p>
                </div>
              ) : (
                <>
                  {/* Name field */}
                  {widget.field_name_enabled && (
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        Nome {widget.field_name_required && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Seu nome"
                        style={{ borderColor: '#e5e7eb' }}
                      />
                    </div>
                  )}

                  {/* Email field */}
                  {widget.field_email_enabled && (
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        Email {widget.field_email_required && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        type="email"
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="seu@email.com"
                        style={{ borderColor: '#e5e7eb' }}
                      />
                    </div>
                  )}

                  {/* CPF field */}
                  {widget.field_cpf_enabled && (
                    <div>
                      <label className="text-sm font-medium block mb-1">
                        CPF {widget.field_cpf_required && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="000.000.000-00"
                        style={{ borderColor: '#e5e7eb' }}
                      />
                    </div>
                  )}

                  {/* WhatsApp field */}
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      WhatsApp {widget.field_whatsapp_required && <span className="text-red-500">*</span>}
                    </label>
                    <input 
                      type="tel"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="(00) 00000-0000"
                      style={{ borderColor: '#e5e7eb' }}
                    />
                  </div>

                  {/* Custom fields */}
                  {customFields.map((field, index) => (
                    <div key={index}>
                      <label className="text-sm font-medium block mb-1">
                        {field.field_label} {field.is_required && <span className="text-red-500">*</span>}
                      </label>
                      {field.field_type === 'textarea' ? (
                        <textarea 
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder={field.field_placeholder || ''}
                          rows={3}
                          style={{ borderColor: '#e5e7eb' }}
                        />
                      ) : field.field_type === 'select' ? (
                        <select 
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          style={{ borderColor: '#e5e7eb' }}
                        >
                          <option value="">Selecione...</option>
                          {(field.field_options || []).map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : field.field_type === 'checkbox' ? (
                        <label className="flex items-center gap-2">
                          <input type="checkbox" />
                          <span className="text-sm">{field.field_placeholder || 'Aceito os termos'}</span>
                        </label>
                      ) : (
                        <input 
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder={field.field_placeholder || ''}
                          style={{ borderColor: '#e5e7eb' }}
                        />
                      )}
                    </div>
                  ))}

                  {/* Submit button */}
                  <button
                    onClick={handleSimulateSubmit}
                    className="w-full py-2.5 rounded-md text-white font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: widget.form_accent_color || '#6366f1' }}
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
