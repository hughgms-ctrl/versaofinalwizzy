import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Check,
  Copy,
  ExternalLink,
  FileCheck,
  FileSignature,
  FileText,
  Folder,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getPublicAppOrigin } from '@/lib/publicOrigin';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTemplates, type DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { useDocumentPacks, type DocumentPack } from '@/hooks/useDocumentPacks';
import { useGeneratedDocuments, type GeneratedDocument } from '@/hooks/useGeneratedDocuments';
import { useCreateSignatureRequest, useDocumentSignatures, type DocumentSignature } from '@/hooks/useDocumentSignatures';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useAddContactFile, useCreateContactFolder } from '@/hooks/useContactFiles';
import { openDocFileInNewTab, contactFilesPathFromUrl, type DocFileRef } from '@/components/documents/documentFiles';
import { getGeneratedDocumentWorkspaceId } from '@/lib/workspaceMatch';

interface ContactContractsSectionProps {
  contactId: string;
  conversationId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  workspaceId?: string | null;
}

interface DocumentSignerRow {
  id: string;
  generated_document_id: string;
  pack_id: string | null;
  signature_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  signer_cpf: string | null;
  order: number | null;
  status: string;
  signature_token: string | null;
  sent_at: string | null;
  signed_at: string | null;
  metadata: Record<string, any> | null;
}

interface ContractGroup {
  id: string;
  name: string;
  isPack: boolean;
  packId: string | null;
  createdAt: string;
  docs: GeneratedDocument[];
  signatures: DocumentSignature[];
  signers: DocumentSignerRow[];
}

interface GeneratedContractGroup {
  id: string;
  name: string;
  isPack: boolean;
  docIds: string[];
  docs: GeneratedDocument[];
  createdAt: string;
}

interface SignerLinkItem {
  id: string;
  name: string;
  status: string;
  link: string;
  signerId?: string;
  signatureId?: string;
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  sent: 'Enviado',
  opened: 'Aberto',
  signed: 'Assinado',
  rejected: 'Recusado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  generated: 'Gerado',
};

function getSignatureLink(signature?: DocumentSignature | null) {
  if (!signature) return '';
  if (signature.signature_token) return `${getPublicAppOrigin()}/sign/${signature.signature_token}`;
  if (signature.signature_url) return signature.signature_url;
  return '';
}

function getSignerLink(signer?: DocumentSignerRow | null) {
  return signer?.signature_token ? `${getPublicAppOrigin()}/sign/${signer.signature_token}` : '';
}

function statusBadgeClass(status: string) {
  if (status === 'signed') return 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10';
  if (status === 'sent' || status === 'opened') return 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/10';
  if (status === 'rejected' || status === 'expired' || status === 'cancelled') return 'bg-destructive/10 text-destructive hover:bg-destructive/10';
  return '';
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function buildFilledData(fields: any[], contactName?: string | null, contactPhone?: string | null, contactEmail?: string | null) {
  const data: Record<string, string> = {};
  for (const field of fields || []) {
    const name = String(field.name || field || '');
    const label = normalizeText(`${field.label || ''} ${name}`);
    if (label.includes('email') || label.includes('e-mail')) data[name] = contactEmail || '';
    else if (label.includes('telefone') || label.includes('celular') || label.includes('whatsapp') || label.includes('phone')) data[name] = contactPhone || '';
    else if (label.includes('cliente') || label.includes('nome') || label.includes('name') || label.includes('contratante')) data[name] = contactName || '';
    else data[name] = '';
  }
  return data;
}

// Resolve não só a URL do PDF assinado, mas de QUAL linha/tabela ela veio — o
// sign-document-file (edge) busca o valor pelo {table,id,field} enviado, não pela
// rawUrl. Se a URL na verdade mora em document_signatures (3º branch) mas mandarmos
// {table:'generated_documents', id: doc.id}, o campo lá está NULL, o edge devolve
// null e o cliente cai pra rawUrl crua — que já não resolve com o bucket privado.
function getDocSignedFileRef(doc: GeneratedDocument, signatures: DocumentSignature[]): DocFileRef | null {
  const docUrl = (doc as any).signed_pdf_url;
  if (docUrl) return { table: 'generated_documents', id: doc.id, field: 'signed_pdf_url', rawUrl: docUrl };

  const viaJoinedDoc = signatures.find((signature) => signature.generated_document?.signed_pdf_url);
  if (viaJoinedDoc) {
    return { table: 'generated_documents', id: doc.id, field: 'signed_pdf_url', rawUrl: viaJoinedDoc.generated_document!.signed_pdf_url! };
  }

  const viaSignature = signatures.find((signature) => signature.signed_pdf_url);
  if (viaSignature) {
    return { table: 'document_signatures', id: viaSignature.id, field: 'signed_pdf_url', rawUrl: viaSignature.signed_pdf_url! };
  }

  return null;
}

function getGroupStatus(group: ContractGroup) {
  const docsSigned = group.docs.length > 0 && group.docs.every((doc) => !!(doc as any).signed_pdf_url || doc.signing_status === 'signed');
  const signaturesSigned = group.signatures.length > 0 && group.signatures.every((signature) => signature.status === 'signed');
  const signersSigned = group.signers.length > 0 && group.signers.every((signer) => signer.status === 'signed');
  if (docsSigned || signaturesSigned || signersSigned) return 'signed';
  if (group.signatures.some((signature) => signature.status === 'opened')) return 'opened';
  if (group.signatures.some((signature) => signature.status === 'sent' || signature.sent_at) || group.signers.some((signer) => signer.status === 'sent' || signer.sent_at)) return 'sent';
  return group.signatures[0]?.status || group.signers[0]?.status || group.docs[0]?.signing_status || group.docs[0]?.status || 'pending';
}

function getSignerKey(signer: DocumentSignerRow) {
  const meta = signer.metadata || {};
  return String(
    meta.pack_signer_key
    || `${signer.order ?? meta.order ?? ''}:${signer.signer_email || ''}:${signer.signer_phone || ''}:${signer.signer_cpf || ''}:${signer.signer_name || ''}`,
  );
}

function getSignatureKey(signature: DocumentSignature) {
  return `${signature.signer_email || ''}:${signature.signer_phone || ''}:${signature.signer_name || ''}:${signature.signer_cpf || ''}`;
}

function getSignatureProgress(signers: DocumentSignerRow[], signatures: DocumentSignature[]) {
  if (signers.length > 0) {
    const bySigner = new Map<string, DocumentSignerRow[]>();
    for (const signer of signers) {
      const key = getSignerKey(signer);
      const rows = bySigner.get(key) || [];
      rows.push(signer);
      bySigner.set(key, rows);
    }
    const groups = Array.from(bySigner.values());
    const signed = groups.filter((rows) => rows.some((signer) => signer.status === 'signed' || !!signer.signed_at)).length;
    return { signed, total: groups.length };
  }

  if (signatures.length > 0) {
    const bySigner = new Map<string, DocumentSignature[]>();
    for (const signature of signatures) {
      const key = getSignatureKey(signature) || signature.id;
      const rows = bySigner.get(key) || [];
      rows.push(signature);
      bySigner.set(key, rows);
    }
    const groups = Array.from(bySigner.values());
    const signed = groups.filter((rows) => rows.some((signature) => signature.status === 'signed' || !!signature.signed_pdf_url)).length;
    return { signed, total: groups.length };
  }

  return { signed: 0, total: 0 };
}

function getGroupProgress(group: ContractGroup) {
  return getSignatureProgress(group.signers, group.signatures);
}

function getGeneratedGroupProgress(
  group: GeneratedContractGroup,
  signaturesByDoc: Map<string, DocumentSignature[]>,
  signersByDoc: Map<string, DocumentSignerRow[]>,
) {
  const signers = group.docs.flatMap((doc) => signersByDoc.get(doc.id) || []);
  const signatures = group.docs.flatMap((doc) => signaturesByDoc.get(doc.id) || []);
  return getSignatureProgress(signers, signatures);
}

function getSignerLinkItems(group: ContractGroup): SignerLinkItem[] {
  if (group.signers.length > 0) {
    const bySigner = new Map<string, DocumentSignerRow[]>();
    for (const signer of group.signers) {
      const key = getSignerKey(signer);
      const rows = bySigner.get(key) || [];
      rows.push(signer);
      bySigner.set(key, rows);
    }

    return Array.from(bySigner.entries()).map(([key, rows]) => {
      const withLink = rows.find((signer) => getSignerLink(signer)) || rows[0];
      return {
        id: `signer:${key}`,
        signerId: withLink.id,
        name: withLink.signer_name || withLink.signer_email || withLink.signer_phone || 'Signatário',
        status: rows.some((signer) => signer.status === 'signed' || signer.signed_at) ? 'signed' : (withLink.status || 'pending'),
        link: getSignerLink(withLink),
      };
    }).filter((item) => !!item.link);
  }

  return group.signatures.map((signature) => ({
    id: `signature:${signature.id}`,
    signatureId: signature.id,
    name: signature.signer_name || signature.signer_email || signature.signer_phone || 'Signatário',
    status: signature.status || 'pending',
    link: getSignatureLink(signature),
  })).filter((item) => !!item.link);
}

function getFilledByFromDoc(doc: GeneratedDocument) {
  const submittedBy = (doc as any).submitted_by || {};
  const filledData = doc.filled_data || {};
  const direct = submittedBy.name || submittedBy.nome || filledData.nome || filledData.name || filledData.cliente || filledData.contratante;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const parts = doc.name.split(' - ').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 1];
  return '';
}

function getPackName(doc: GeneratedDocument) {
  const packName = (doc as any).document_packs?.name || 'Pack de documentos';
  const filledBy = getFilledByFromDoc(doc);
  return filledBy ? `${packName} - ${filledBy}` : packName;
}

export function ContactContractsSection({
  contactId,
  conversationId,
  contactName,
  contactPhone,
  contactEmail,
  workspaceId,
}: ContactContractsSectionProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading: loadingTemplates } = useDocumentTemplates();
  const { data: packs = [], isLoading: loadingPacks } = useDocumentPacks();
  const { data: documents = [], isLoading: loadingDocuments } = useGeneratedDocuments();
  const { data: signatures = [], isLoading: loadingSignatures } = useDocumentSignatures();
  const createSignature = useCreateSignatureRequest();
  const sendMessage = useSendMessage();
  const addContactFile = useAddContactFile();
  const createContactFolder = useCreateContactFolder();
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedGeneratedGroupId, setSelectedGeneratedGroupId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState('');

  // Templates/packs carregam workspace_id; só o do workspace atual deve aparecer para
  // gerar novo envio (evita puxar contrato de outro workspace do mesmo org).
  const visibleTemplates = useMemo(() => (
    workspaceId ? templates.filter((template) => template.workspace_id === workspaceId) : templates
  ), [templates, workspaceId]);
  const visiblePacks = useMemo(() => (
    workspaceId ? packs.filter((pack) => pack.workspace_id === workspaceId) : packs
  ), [packs, workspaceId]);

  const signaturesByDoc = useMemo(() => {
    const map = new Map<string, DocumentSignature[]>();
    for (const signature of signatures) {
      const rows = map.get(signature.generated_document_id) || [];
      rows.push(signature);
      map.set(signature.generated_document_id, rows);
    }
    return map;
  }, [signatures]);

  const contactDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (doc.contact_id === contactId) return true;
      if (conversationId && doc.conversation_id === conversationId) return true;
      const docSignatures = signaturesByDoc.get(doc.id) || [];
      return docSignatures.some((signature) => (
        signature.contact_id === contactId || (conversationId && signature.conversation_id === conversationId)
      ));
    });
  }, [contactId, conversationId, documents, signaturesByDoc]);

  const { data: signers = [], isLoading: loadingSigners } = useQuery({
    queryKey: ['document-signers-contact-contracts', documents.map((doc) => doc.id).join(',')],
    queryFn: async () => {
      const docIds = documents.map((doc) => doc.id);
      if (docIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('document_signers')
        .select('id, generated_document_id, pack_id, signature_id, signer_name, signer_email, signer_phone, signer_cpf, order, status, signature_token, sent_at, signed_at, metadata')
        .in('generated_document_id', docIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as DocumentSignerRow[];
    },
    enabled: documents.length > 0,
  });

  const signersByDoc = useMemo(() => {
    const map = new Map<string, DocumentSignerRow[]>();
    for (const signer of signers) {
      const rows = map.get(signer.generated_document_id) || [];
      rows.push(signer);
      map.set(signer.generated_document_id, rows);
    }
    return map;
  }, [signers]);

  const contractGroups = useMemo(() => {
    const map = new Map<string, ContractGroup>();
    for (const doc of contactDocuments) {
      const submissionGroup = (doc as any).submission_group || doc.id;
      const groupId = doc.pack_id ? `pack:${doc.pack_id}:${submissionGroup}` : `doc:${doc.id}`;
      const group = map.get(groupId) || {
        id: groupId,
        name: doc.pack_id ? getPackName(doc) : doc.name,
        isPack: !!doc.pack_id,
        packId: doc.pack_id,
        createdAt: doc.created_at,
        docs: [],
        signatures: [],
        signers: [],
      };
      group.docs.push(doc);
      group.signatures.push(...(signaturesByDoc.get(doc.id) || []));
      group.signers.push(...(signersByDoc.get(doc.id) || []));
      if (new Date(doc.created_at) < new Date(group.createdAt)) group.createdAt = doc.created_at;
      map.set(groupId, group);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [contactDocuments, signaturesByDoc, signersByDoc]);

  const availableGeneratedGroups = useMemo(() => {
    const linked = new Set(contactDocuments.map((doc) => doc.id));
    const map = new Map<string, GeneratedContractGroup>();
    for (const doc of documents) {
      if (linked.has(doc.id)) continue;
      if (workspaceId && getGeneratedDocumentWorkspaceId(doc as any) !== workspaceId) continue;
      const docSignatures = signaturesByDoc.get(doc.id) || [];
      const docSigners = signersByDoc.get(doc.id) || [];
      const hasSignatureLink = docSignatures.some((signature) => !!getSignatureLink(signature))
        || docSigners.some((signer) => !!getSignerLink(signer));
      if (!hasSignatureLink) continue;

      const submissionGroup = (doc as any).submission_group || doc.id;
      const groupId = doc.pack_id ? `pack:${doc.pack_id}:${submissionGroup}` : `doc:${doc.id}`;
      const group = map.get(groupId) || {
        id: groupId,
        name: doc.pack_id ? getPackName(doc) : doc.name,
        isPack: !!doc.pack_id,
        docIds: [],
        docs: [],
        createdAt: doc.created_at,
      };
      group.docIds.push(doc.id);
      group.docs.push(doc);
      if (new Date(doc.created_at) < new Date(group.createdAt)) group.createdAt = doc.created_at;
      map.set(groupId, group);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [contactDocuments, documents, signaturesByDoc, signersByDoc, workspaceId]);

  // Texto buscável por grupo (nome, email, telefone, CPF dos signatários) pra filtrar
  // "vincular assinatura existente" sem precisar rolar a lista inteira.
  const getGroupSearchText = (group: GeneratedContractGroup) => {
    const signers = group.docs.flatMap((doc) => signersByDoc.get(doc.id) || []);
    const signatures = group.docs.flatMap((doc) => signaturesByDoc.get(doc.id) || []);
    const parts = [
      group.name,
      ...signers.flatMap((signer) => [signer.signer_name, signer.signer_email, signer.signer_phone, signer.signer_cpf]),
      ...signatures.flatMap((signature) => [signature.signer_name, signature.signer_email, signature.signer_phone, signature.signer_cpf]),
    ].filter(Boolean) as string[];
    return normalizeText(parts.join(' '));
  };

  const filteredGeneratedGroups = useMemo(() => {
    const query = normalizeText(linkSearch.trim());
    if (!query) return availableGeneratedGroups;
    const queryDigits = linkSearch.replace(/\D/g, '');
    return availableGeneratedGroups.filter((group) => {
      const text = getGroupSearchText(group);
      if (text.includes(query)) return true;
      if (queryDigits && text.replace(/\D/g, '').includes(queryDigits)) return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableGeneratedGroups, linkSearch, signersByDoc, signaturesByDoc]);

  const linkGeneratedGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const group = availableGeneratedGroups.find((item) => item.id === groupId);
      if (!group) throw new Error('Contrato não encontrado');
      const { error } = await (supabase as any)
        .from('generated_documents')
        .update({
          contact_id: contactId,
          conversation_id: conversationId || null,
        })
        .in('id', group.docIds);
      if (error) throw error;

      await (supabase as any)
        .from('document_signatures')
        .update({
          contact_id: contactId,
          conversation_id: conversationId || null,
        })
        .in('generated_document_id', group.docIds);
    },
    onSuccess: () => {
      setSelectedGeneratedGroupId('');
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-signatures'] });
      queryClient.invalidateQueries({ queryKey: ['document-signers-contact-contracts'] });
      toast({ title: 'Assinatura vinculada ao contato' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao vincular assinatura', description: error.message, variant: 'destructive' });
    },
  });

  const createSigningFromSource = useMutation({
    mutationFn: async (source: string) => {
      if (!profile?.organization_id || !profile?.id) throw new Error('Perfil não encontrado');
      const [kind, id] = source.split(':');
      const submissionGroup = crypto.randomUUID();
      const signerName = contactName || 'Cliente';
      const signerEmail = contactEmail || null;
      const signerPhone = contactPhone || null;
      const otpChannel = signerEmail ? 'email' : 'whatsapp';

      const generateDoc = async (template: DocumentTemplate, packId: string | null, packName?: string) => {
        const fields = (template.fields || []) as any[];
        const filledData = buildFilledData(fields, contactName, contactPhone, contactEmail);
        const docName = packName ? `${packName} - ${template.name}` : template.name;
        const { data: pdfData, error: pdfError } = await supabase.functions.invoke('generate-document-pdf', {
          body: {
            template_content: template.content,
            template_content_html: template.content_html,
            fields,
            filled_data: filledData,
            document_name: docName,
            logo_url: template.logo_url || null,
            template_id: template.id,
          },
        });
        if (pdfError) throw pdfError;

        const { data: docData, error } = await (supabase as any)
          .from('generated_documents')
          .insert({
            organization_id: profile.organization_id,
            template_id: template.id,
            pack_id: packId,
            contact_id: contactId,
            conversation_id: conversationId || null,
            name: docName,
            filled_data: filledData,
            pdf_url: pdfData?.pdf_url || null,
            status: 'generated',
            signing_method: 'internal',
            signing_status: 'pending',
            fill_mode: 'internal',
            is_filled: true,
            submission_group: packId ? submissionGroup : null,
            created_by: profile.id,
          })
          .select('*')
          .single();
        if (error) throw error;
        return docData as GeneratedDocument;
      };

      if (kind === 'template') {
        const template = templates.find((item) => item.id === id);
        if (!template) throw new Error('Documento não encontrado');
        const doc = await generateDoc(template, null);
        const signature = await createSignature.mutateAsync({
          generated_document_id: doc.id,
          signing_method: 'internal',
          signer_name: signerName,
          signer_email: signerEmail || undefined,
          signer_phone: signerPhone || undefined,
          contact_id: contactId,
          conversation_id: conversationId || undefined,
          otp_channel: otpChannel,
        });
        return {
          id: doc.id,
          name: doc.name,
          link: getSignatureLink(signature),
          docIds: [doc.id],
          signerIds: [] as string[],
          signatureIds: [signature.id],
        };
      }

      const pack = packs.find((item) => item.id === id);
      if (!pack) throw new Error('Pack não encontrado');
      const packTemplates = pack.template_ids
        .map((templateId) => templates.find((template) => template.id === templateId))
        .filter(Boolean) as DocumentTemplate[];
      if (packTemplates.length === 0) throw new Error('Pack sem documentos configurados');

      const generatedDocs: GeneratedDocument[] = [];
      for (const template of packTemplates) {
        generatedDocs.push(await generateDoc(template, pack.id, pack.name));
      }

      const packSignerKey = crypto.randomUUID();
      const signerRows = generatedDocs.map((doc) => ({
        organization_id: profile.organization_id,
        generated_document_id: doc.id,
        pack_id: pack.id,
        signer_name: signerName,
        signer_email: signerEmail,
        signer_phone: signerPhone,
        signer_cpf: null,
        signer_role: 'Assinar',
        signing_method: 'internal',
        auth_methods: {
          manuscrita: true,
          selfie: true,
          otp_email: !!signerEmail,
          otp_whatsapp: !signerEmail && !!signerPhone,
        },
        signature_token: crypto.randomUUID(),
        order: 0,
        status: 'pending',
        data_source: 'manual',
        field_mapping: {},
        metadata: {
          pack_signer_key: packSignerKey,
          contact_id: contactId,
          conversation_id: conversationId || null,
        },
      }));

      const { data: createdSigners, error: signerError } = await (supabase as any)
        .from('document_signers')
        .insert(signerRows)
        .select('id, signature_token');
      if (signerError) throw signerError;

      return {
        id: `pack:${pack.id}:${submissionGroup}`,
        name: pack.name,
        link: getSignerLink(createdSigners?.[0] as DocumentSignerRow),
        docIds: generatedDocs.map((doc) => doc.id),
        signerIds: (createdSigners || []).map((signer: any) => signer.id),
        signatureIds: [] as string[],
      };
    },
    onSuccess: async (result) => {
      setSelectedSource('');
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-signatures'] });
      queryClient.invalidateQueries({ queryKey: ['document-signers-contact-contracts'] });
      if (result.link) {
        await navigator.clipboard.writeText(result.link);
        setCopiedId(result.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
      toast({ title: 'Link de assinatura criado', description: 'O link já foi copiado.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar envio', description: error.message, variant: 'destructive' });
    },
  });

  const markGroupSent = async (group: ContractGroup) => {
    const signatureIds = group.signatures.map((signature) => signature.id);
    const signerIds = group.signers.map((signer) => signer.id);
    if (signatureIds.length > 0) {
      await (supabase as any)
        .from('document_signatures')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', signatureIds);
    }
    if (signerIds.length > 0) {
      await (supabase as any)
        .from('document_signers')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', signerIds);
    }
    queryClient.invalidateQueries({ queryKey: ['document-signatures'] });
    queryClient.invalidateQueries({ queryKey: ['document-signers-contact-contracts'] });
  };

  const copySignerLink = async (item: SignerLinkItem) => {
    setBusyId(item.id);
    try {
      await navigator.clipboard.writeText(item.link);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: 'Link copiado' });
    } finally {
      setBusyId(null);
    }
  };

  const sendGroupLinks = async (group: ContractGroup, signerLinks: SignerLinkItem[]) => {
    if (!conversationId) {
      if (signerLinks[0]) await copySignerLink(signerLinks[0]);
      return;
    }

    setBusyId(group.id);
    try {
      if (signerLinks.length === 0) throw new Error('Link não encontrado');
      const label = group.isPack ? 'pack de documentos' : 'contrato';
      const linksText = signerLinks.map((item) => `${item.name}: ${item.link}`).join('\n');
      const message = `Olá${contactName ? `, ${contactName}` : ''}! Seguem os links para assinatura do ${label} "${group.name}":\n\n${linksText}`;
      await sendMessage.mutateAsync({ conversationId, content: message });
      await markGroupSent(group);
      toast({ title: signerLinks.length > 1 ? 'Links enviados na conversa' : 'Link enviado na conversa' });
    } finally {
      setBusyId(null);
    }
  };

  const saveSignedGroupToFiles = async (group: ContractGroup) => {
    const signedDocs = group.docs
      .map((doc) => ({
        doc,
        ref: getDocSignedFileRef(doc, signaturesByDoc.get(doc.id) || []),
      }))
      .filter((item) => !!item.ref);

    if (signedDocs.length === 0) return;
    const folder = group.isPack
      ? await createContactFolder.mutateAsync({ contactId, name: `${group.name} - assinado` })
      : null;

    for (const item of signedDocs) {
      await addContactFile.mutateAsync({
        contactId,
        folderId: folder?.id || null,
        name: `${item.doc.name} - assinado.pdf`,
        fileUrl: item.ref!.rawUrl!,
        fileType: 'document',
        fileSize: null,
        // Esses PDFs moram em signatures/... ou generated/... no bucket — gravar o path
        // aqui é o que permite à policy de storage (via contact_files) autorizar o
        // createSignedUrl direto na hora de abrir/baixar.
        storagePath: contactFilesPathFromUrl(item.ref!.rawUrl),
      });
    }
  };

  const deleteGroup = useMutation({
    mutationFn: async (group: ContractGroup) => {
      const status = getGroupStatus(group);
      if (status === 'signed') {
        throw new Error('Contratos assinados não podem ser excluídos por aqui.');
      }

      const docIds = group.docs.map((doc) => doc.id);
      const signatureIds = group.signatures.map((signature) => signature.id);
      const signerIds = group.signers.map((signer) => signer.id);

      if (signatureIds.length > 0) {
        await (supabase as any)
          .from('signature_evidence')
          .delete()
          .in('signature_id', signatureIds);
        const { error } = await (supabase as any)
          .from('document_signatures')
          .delete()
          .in('id', signatureIds);
        if (error) throw error;
      }

      if (signerIds.length > 0) {
        const { error } = await (supabase as any)
          .from('document_signers')
          .delete()
          .in('id', signerIds);
        if (error) throw error;
      }

      if (docIds.length > 0) {
        const { error } = await (supabase as any)
          .from('generated_documents')
          .delete()
          .in('id', docIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-signatures'] });
      queryClient.invalidateQueries({ queryKey: ['document-signers-contact-contracts'] });
      toast({ title: 'Envio excluído' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir envio', description: error.message, variant: 'destructive' });
    },
  });

  const isLoading = loadingDocuments || loadingSignatures || loadingSigners || loadingTemplates || loadingPacks;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-muted/25 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <FileSignature className="h-3.5 w-3.5" />
            <span>Novo envio para assinatura</span>
          </div>
          {copiedId && <Badge variant="outline" className="text-[10px]">Link copiado</Badge>}
        </div>

        <div className="flex gap-2">
          <select
            value={selectedSource}
            onChange={(event) => setSelectedSource(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">Escolher documento ou pack...</option>
            <optgroup label="Packs">
              {visiblePacks.length > 0 && (
                <>
                  {visiblePacks.map((pack) => (
                    <option key={`pack:${pack.id}`} value={`pack:${pack.id}`}>
                      Pack: {pack.name}
                    </option>
                  ))}
                </>
              )}
            </optgroup>
            <optgroup label="Documentos">
              {visibleTemplates.map((template) => (
                <option key={`template:${template.id}`} value={`template:${template.id}`}>
                  Documento: {template.name}
                </option>
              ))}
            </optgroup>
          </select>
          <Button
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            disabled={!selectedSource || createSigningFromSource.isPending}
            onClick={() => createSigningFromSource.mutate(selectedSource)}
          >
            {createSigningFromSource.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Gerar link
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <Label className="text-xs text-muted-foreground">Vincular assinatura existente</Label>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={linkSearch}
            onChange={(event) => setLinkSearch(event.target.value)}
            placeholder="Buscar por nome, telefone, email ou CPF..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        {(contactPhone || contactEmail) && (
          <div className="flex flex-wrap gap-1.5">
            {contactPhone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setLinkSearch(contactPhone)}
              >
                Tel. do contato
              </Button>
            )}
            {contactEmail && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setLinkSearch(contactEmail)}
              >
                Email do contato
              </Button>
            )}
            {linkSearch && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground"
                onClick={() => setLinkSearch('')}
              >
                Limpar
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <select
            value={selectedGeneratedGroupId}
            onChange={(event) => setSelectedGeneratedGroupId(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">
              {filteredGeneratedGroups.length === 0 ? 'Nenhum resultado...' : 'Buscar assinatura ou pack na aba Assinaturas...'}
            </option>
              {filteredGeneratedGroups.map((group) => (
                (() => {
                  const progress = getGeneratedGroupProgress(group, signaturesByDoc, signersByDoc);
                  const progressLabel = progress.total > 0 ? `Signatários ${progress.signed}/${progress.total}` : 'Sem assinatura';
                  return (
                    <option key={group.id} value={group.id}>
                      {group.isPack
                        ? `Pack: ${group.name} - ${progressLabel} - ${format(new Date(group.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                        : `${group.name} - ${progressLabel} - ${format(new Date(group.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`}
                    </option>
                  );
                })()
              ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-9 shrink-0 gap-1.5"
            disabled={!selectedGeneratedGroupId || linkGeneratedGroup.isPending}
            onClick={() => linkGeneratedGroup.mutate(selectedGeneratedGroupId)}
          >
            {linkGeneratedGroup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Vincular
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
        <FileCheck className="h-3.5 w-3.5" />
        <span>Contratos do contato</span>
        {contractGroups.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{contractGroups.length}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : contractGroups.length === 0 ? (
        <Card className="border-dashed p-6 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhum contrato no perfil</p>
          <p className="mt-1 text-xs text-muted-foreground">Gere um envio acima para o documento ou pack aparecer por aqui.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {contractGroups.map((group) => {
            const status = getGroupStatus(group);
            const progress = getGroupProgress(group);
            const signerLinks = getSignerLinkItems(group);
            const busy = busyId === group.id || sendMessage.isPending;
            // ref (table/id/field certos) pra poder assinar por org na hora de abrir (bucket privatizável).
            const signedEntries = group.docs
              .map((doc) => getDocSignedFileRef(doc, signaturesByDoc.get(doc.id) || []))
              .filter((ref): ref is DocFileRef => !!ref);
            const firstSigned = signedEntries[0] || null;

            return (
              <Card key={group.id} className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {group.isPack ? (
                        <Folder className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                      )}
                      <p className="truncate text-sm font-medium">{group.name}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant={statusBadgeClass(status) ? 'default' : 'secondary'} className={`text-[10px] ${statusBadgeClass(status)}`}>
                        {statusLabels[status] || status}
                      </Badge>
                      {group.isPack && progress.total > 0 && <Badge variant="outline" className="text-[10px]">Signatários {progress.signed}/{progress.total}</Badge>}
                      {group.isPack && <Badge variant="outline" className="text-[10px]">{group.docs.length} documentos</Badge>}
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(group.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                  {!group.isPack && firstSigned && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Abrir PDF"
                      onClick={() => openDocFileInNewTab(firstSigned)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {group.isPack && (
                  <div className="rounded-md border border-border/70 bg-background/50 p-2">
                    <div className="space-y-1">
                      {group.docs.map((doc) => {
                        const signedRef = getDocSignedFileRef(doc, signaturesByDoc.get(doc.id) || []);
                        return (
                          <div key={doc.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-muted-foreground">{doc.name}</span>
                            {signedRef ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => openDocFileInNewTab(signedRef)}
                              >
                                Ver assinado
                              </Button>
                            ) : (
                              <span className="shrink-0 text-[10px] text-muted-foreground">Aguardando</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {signerLinks.length > 0 && (
                  <div className="space-y-2">
                    {signerLinks.map((item) => (
                      <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="truncate text-[11px] font-medium">{item.name}</span>
                            <Badge variant={statusBadgeClass(item.status) ? 'default' : 'secondary'} className={`text-[10px] ${statusBadgeClass(item.status)}`}>
                              {statusLabels[item.status] || item.status}
                            </Badge>
                          </div>
                          <Input value={item.link} readOnly className="h-8 font-mono text-[11px]" onClick={(event) => event.currentTarget.select()} />
                        </div>
                        <Button variant="outline" size="sm" className="mt-5 h-8 shrink-0 gap-1.5" onClick={() => copySignerLink(item)} disabled={busyId === item.id}>
                          {copiedId === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === item.id ? 'Copiado' : 'Copiar'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {signerLinks.length > 0 && (
                    <Button size="sm" className="gap-1.5" onClick={() => sendGroupLinks(group, signerLinks)} disabled={busy}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {conversationId ? 'Enviar links' : 'Copiar link'}
                    </Button>
                  )}
                  {status !== 'signed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => deleteGroup.mutate(group)}
                      disabled={deleteGroup.isPending}
                    >
                      {deleteGroup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Excluir envio
                    </Button>
                  )}
                  {signedEntries.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => firstSigned && openDocFileInNewTab(firstSigned)}
                      >
                        <FileCheck className="h-3.5 w-3.5" />
                        {group.isPack ? 'Ver assinado' : 'Ver assinado'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => saveSignedGroupToFiles(group)}
                        disabled={addContactFile.isPending || createContactFolder.isPending}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {group.isPack ? 'Salvar pasta em anexos' : 'Salvar em anexos'}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
