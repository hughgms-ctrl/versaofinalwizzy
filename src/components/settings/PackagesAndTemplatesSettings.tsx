import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Library, FolderHeart } from 'lucide-react';
import { CatalogTab } from './CatalogTab';
import { MyTemplatesTab } from './MyTemplatesTab';
import { useCurrentUserRole } from '@/hooks/useUserPermissions';

export function PackagesAndTemplatesSettings() {
  const { data: role } = useCurrentUserRole();
  const canManage = role === 'owner' || role === 'admin';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Pacotes & Templates
        </CardTitle>
        <CardDescription>
          Ative pacotes prontos do catálogo, ou crie e gerencie seus próprios templates dentro de um workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="catalog" className="space-y-4">
          <TabsList>
            <TabsTrigger value="catalog" className="gap-1.5">
              <Library className="h-4 w-4" />Catálogo da plataforma
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="mine" className="gap-1.5">
                <FolderHeart className="h-4 w-4" />Meus templates
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="catalog">
            <CatalogTab canManage={canManage} />
          </TabsContent>
          {canManage && (
            <TabsContent value="mine" className="space-y-4">
              <MyTemplatesTab />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
