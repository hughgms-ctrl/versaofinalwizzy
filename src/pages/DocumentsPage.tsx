import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { TemplatesList } from '@/components/documents/TemplatesList';
import { PacksList } from '@/components/documents/PacksList';
import { GeneratedDocumentsList } from '@/components/documents/GeneratedDocumentsList';
import { SignaturesList } from '@/components/documents/SignaturesList';
import { CreateSignatureDialog } from '@/components/documents/CreateSignatureDialog';
import { useGeneratedDocuments } from '@/hooks/useGeneratedDocuments';
import { FileText, Package, History, FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState('templates');
  const [signatureDocId, setSignatureDocId] = useState<string | null>(null);
  const { data: documents } = useGeneratedDocuments();

  const handleGeneratedForSignature = (documentId: string) => {
    setSignatureDocId(documentId);
  };

  const availableDocuments = documents?.filter(d => d.pdf_url && d.status !== 'draft') || [];
  const navItems = [
    { value: 'templates', label: 'Templates', description: 'Modelos base', icon: FileText },
    { value: 'packs', label: 'Packs', description: 'Conjuntos públicos', icon: Package },
    { value: 'generated', label: 'Gerados', description: 'PDFs criados', icon: History },
    { value: 'signatures', label: 'Assinaturas', description: 'Links e status', icon: FileSignature },
  ];

  return (
    <MainLayout title="Wizzy Sign" subtitle="Gerencie templates, packs, documentos e assinaturas">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.value;
            return (
              <TabsTrigger key={item.value} value={item.value} asChild>
                <Card
                  className={cn(
                    'flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border p-3 text-left shadow-none transition-colors data-[state=active]:shadow-none',
                    active ? 'border-primary/50 bg-primary/10' : 'border-border bg-card hover:bg-muted/60'
                  )}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                    <span className="mt-0.5 hidden text-[11px] font-normal text-muted-foreground sm:block">{item.description}</span>
                  </span>
                </Card>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="templates" className="mt-0">
          <TemplatesList onGeneratedForSignature={handleGeneratedForSignature} />
        </TabsContent>
        <TabsContent value="packs" className="mt-0">
          <PacksList onGeneratedForSignature={handleGeneratedForSignature} />
        </TabsContent>
        <TabsContent value="generated" className="mt-0">
          <GeneratedDocumentsList />
        </TabsContent>
        <TabsContent value="signatures" className="mt-0">
          <SignaturesList />
        </TabsContent>
      </Tabs>

      <CreateSignatureDialog
        open={!!signatureDocId}
        onOpenChange={(open) => { if (!open) setSignatureDocId(null); }}
        documents={availableDocuments}
        preSelectedDocId={signatureDocId || undefined}
      />
    </MainLayout>
  );
}
