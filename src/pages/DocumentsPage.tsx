import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplatesList } from '@/components/documents/TemplatesList';
import { PacksList } from '@/components/documents/PacksList';
import { GeneratedDocumentsList } from '@/components/documents/GeneratedDocumentsList';
import { SignaturesList } from '@/components/documents/SignaturesList';
import { FileText, Package, History, FileSignature } from 'lucide-react';

export default function DocumentsPage() {
  return (
    <MainLayout title="Documentos" subtitle="Gerencie templates, packs, documentos e assinaturas">
      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="packs" className="gap-2">
            <Package className="h-4 w-4" /> Packs
          </TabsTrigger>
          <TabsTrigger value="generated" className="gap-2">
            <History className="h-4 w-4" /> Gerados
          </TabsTrigger>
          <TabsTrigger value="signatures" className="gap-2">
            <FileSignature className="h-4 w-4" /> Assinaturas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="templates">
          <TemplatesList />
        </TabsContent>
        <TabsContent value="packs">
          <PacksList />
        </TabsContent>
        <TabsContent value="generated">
          <GeneratedDocumentsList />
        </TabsContent>
        <TabsContent value="signatures">
          <SignaturesList />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
