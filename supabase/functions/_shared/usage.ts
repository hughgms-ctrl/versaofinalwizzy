type UsageRow = Record<string, any>

const PAGE_SIZE = 1000

function toNumber(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function first<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function objectSize(object: UsageRow) {
  const metadata = object?.metadata || {}
  return toNumber(metadata.size || metadata.contentLength || metadata.content_length)
}

function add(map: Record<string, number>, orgId: string | null | undefined, bytes: number) {
  if (!orgId || bytes <= 0) return
  map[orgId] = (map[orgId] || 0) + bytes
}

async function safeSelect(client: any, table: string, select: string) {
  const rows: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.warn(`[usage] skipped ${table}: ${error.message}`)
      return []
    }

    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function safeSelectAny(client: any, table: string, selects: string[]) {
  for (const select of selects) {
    const rows = await safeSelect(client, table, select)
    if (rows.length > 0) return rows
  }
  return []
}

function parseStorageUrl(value: unknown): { bucket: string; name: string; key: string } | null {
  const raw = String(value || '')
  if (!raw) return null

  const markers = ['/storage/v1/object/public/', '/object/public/', '/storage/v1/object/sign/', '/object/sign/']
  const marker = markers.find((item) => raw.includes(item))
  if (!marker) return null

  const rest = raw.slice(raw.indexOf(marker) + marker.length).split('?')[0]
  const decoded = decodeURIComponent(rest)
  const [bucket, ...nameParts] = decoded.split('/').filter(Boolean)
  const name = nameParts.join('/')
  if (!bucket || !name) return null
  return { bucket, name, key: `${bucket}/${name}` }
}

function mapUrl(urlMap: Map<string, string>, value: unknown, orgId: string | null | undefined) {
  if (!orgId) return
  const parsed = parseStorageUrl(value)
  if (!parsed) return
  urlMap.set(parsed.key, orgId)
}

function mapUrlsFromJson(urlMap: Map<string, string>, value: unknown, orgId: string | null | undefined) {
  if (!orgId || value == null) return
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const matches = text.match(/https?:\/\/[^"'\s)]+/g) || []
  matches.forEach((url) => mapUrl(urlMap, url, orgId))
}

async function fetchStorageObjects(client: any) {
  const { data: buckets, error: bucketsError } = await client.storage.listBuckets()

  if (bucketsError) throw bucketsError

  const objects: UsageRow[] = []
  for (const bucket of buckets || []) {
    const bucketId = bucket.id || bucket.name
    if (!bucketId) continue
    objects.push(...await listBucketObjects(client, bucketId, ''))
  }

  return objects
}

async function listBucketObjects(client: any, bucketId: string, prefix: string): Promise<UsageRow[]> {
  const objects: UsageRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await client.storage.from(bucketId).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) throw error

    for (const item of data || []) {
      const name = prefix ? `${prefix}/${item.name}` : item.name
      const isFolder = !item.id && !item.metadata

      if (isFolder) {
        objects.push(...await listBucketObjects(client, bucketId, name))
      } else {
        objects.push({
          bucket_id: bucketId,
          name,
          metadata: item.metadata || {},
          updated_at: item.updated_at,
          created_at: item.created_at,
        })
      }
    }

    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return objects
}

export async function calculateOrganizationUsage(
  client: any,
  options: { organizationIds?: string[]; persistStorageUsed?: boolean } = {},
) {
  const requestedOrgIds = new Set((options.organizationIds || []).filter(Boolean))
  const orgs = requestedOrgIds.size
    ? await safeSelect(client, 'organizations', 'id, name, slug, storage_used_bytes, storage_limit_bytes, created_at').then((rows) => rows.filter((org: any) => requestedOrgIds.has(org.id)))
    : await safeSelect(client, 'organizations', 'id, name, slug, storage_used_bytes, storage_limit_bytes, created_at')

  const orgIdSet = new Set((orgs || []).map((org: any) => org.id))
  const usageByOrg: Record<string, any> = {}
  ;(orgs || []).forEach((org: any) => {
    usageByOrg[org.id] = {
      organization_id: org.id,
      storage_used_bytes: 0,
      storage_limit_bytes: toNumber(org.storage_limit_bytes),
      storage_by_bucket: {},
      user_count: 0,
      workspace_count: 0,
      active_workspaces: 0,
      instance_count: 0,
      active_instances: 0,
      conversation_count: 0,
    }
  })

  const [profiles, workspaces, instances, conversations] = await Promise.all([
    safeSelect(client, 'profiles', 'id, user_id, organization_id, avatar_url'),
    safeSelect(client, 'workspaces', 'id, organization_id, is_active'),
    safeSelect(client, 'whatsapp_instances', 'id, organization_id, is_active, status'),
    safeSelect(client, 'conversations', 'id, organization_id'),
  ])

  const conversationOrgById = new Map<string, string>()
  const profileOrgById = new Map<string, string>()
  const profileOrgByUserId = new Map<string, string>()
  const workspaceOrgById = new Map<string, string>()

  for (const profile of profiles || []) {
    if (!orgIdSet.has(profile.organization_id)) continue
    profileOrgById.set(profile.id, profile.organization_id)
    if (profile.user_id) profileOrgByUserId.set(profile.user_id, profile.organization_id)
    usageByOrg[profile.organization_id].user_count += 1
  }

  for (const workspace of workspaces || []) {
    if (!orgIdSet.has(workspace.organization_id)) continue
    workspaceOrgById.set(workspace.id, workspace.organization_id)
    usageByOrg[workspace.organization_id].workspace_count += 1
    if (workspace.is_active !== false) usageByOrg[workspace.organization_id].active_workspaces += 1
  }

  for (const instance of instances || []) {
    if (!orgIdSet.has(instance.organization_id)) continue
    usageByOrg[instance.organization_id].instance_count += 1
    if (instance.is_active || instance.status === 'connected') usageByOrg[instance.organization_id].active_instances += 1
  }

  for (const conversation of conversations || []) {
    if (!orgIdSet.has(conversation.organization_id)) continue
    conversationOrgById.set(conversation.id, conversation.organization_id)
    usageByOrg[conversation.organization_id].conversation_count += 1
  }

  const urlOrgByKey = new Map<string, string>()
  const contactOrgById = new Map<string, string>()
  const taskOrgById = new Map<string, string>()
  const signatureOrgById = new Map<string, string>()
  const generatedDocOrgById = new Map<string, string>()

  const [
    contacts,
    messages,
    contactFiles,
    scheduledMessages,
    templates,
    generatedDocs,
    signatures,
    receipts,
    flows,
    tasks,
    taskAttachments,
  ] = await Promise.all([
    safeSelect(client, 'contacts', 'id, organization_id, avatar_url'),
    safeSelect(client, 'messages', 'conversation_id, media_url'),
    safeSelect(client, 'contact_files', 'organization_id, contact_id, file_url, storage_path'),
    safeSelect(client, 'scheduled_messages', 'organization_id, media_url'),
    safeSelect(client, 'document_templates', 'organization_id, original_file_url, logo_url'),
    safeSelect(client, 'generated_documents', 'id, organization_id, pdf_url, signed_pdf_url'),
    safeSelect(client, 'document_signatures', 'id, organization_id, generated_document_id, signed_pdf_url, signature_url, metadata'),
    safeSelect(client, 'signature_evidence', 'signature_id, original_pdf_url, receipt_pdf_url, selfie_url'),
    safeSelect(client, 'flows', 'id, organization_id, nodes, edges'),
    safeSelectAny(client, 'tasks', ['id, organization_id, workspace_id', 'id, workspace_id']),
    safeSelect(client, 'task_attachments', 'task_id, file_url'),
  ])

  for (const contact of contacts || []) {
    if (!orgIdSet.has(contact.organization_id)) continue
    contactOrgById.set(contact.id, contact.organization_id)
    mapUrl(urlOrgByKey, contact.avatar_url, contact.organization_id)
  }

  for (const message of messages || []) {
    const orgId = conversationOrgById.get(message.conversation_id)
    mapUrl(urlOrgByKey, message.media_url, orgId)
  }

  for (const file of contactFiles || []) {
    if (!orgIdSet.has(file.organization_id)) continue
    mapUrl(urlOrgByKey, file.file_url, file.organization_id)
    if (file.storage_path) urlOrgByKey.set(`contact-files/${file.storage_path}`, file.organization_id)
  }

  for (const scheduled of scheduledMessages || []) mapUrl(urlOrgByKey, scheduled.media_url, scheduled.organization_id)
  for (const template of templates || []) {
    mapUrl(urlOrgByKey, template.original_file_url, template.organization_id)
    mapUrl(urlOrgByKey, template.logo_url, template.organization_id)
  }
  for (const doc of generatedDocs || []) {
    if (orgIdSet.has(doc.organization_id)) generatedDocOrgById.set(doc.id, doc.organization_id)
    mapUrl(urlOrgByKey, doc.pdf_url, doc.organization_id)
    mapUrl(urlOrgByKey, doc.signed_pdf_url, doc.organization_id)
  }
  for (const signature of signatures || []) {
    const orgId = signature.organization_id || generatedDocOrgById.get(signature.generated_document_id)
    if (orgId) signatureOrgById.set(signature.id, orgId)
    mapUrl(urlOrgByKey, signature.signed_pdf_url, orgId)
    mapUrl(urlOrgByKey, signature.signature_url, orgId)
    mapUrlsFromJson(urlOrgByKey, signature.metadata, orgId)
  }
  for (const receipt of receipts || []) {
    const orgId = signatureOrgById.get(receipt.signature_id)
    mapUrl(urlOrgByKey, receipt.original_pdf_url, orgId)
    mapUrl(urlOrgByKey, receipt.receipt_pdf_url, orgId)
    mapUrl(urlOrgByKey, receipt.selfie_url, orgId)
  }
  for (const flow of flows || []) {
    mapUrlsFromJson(urlOrgByKey, flow.nodes, flow.organization_id)
    mapUrlsFromJson(urlOrgByKey, flow.edges, flow.organization_id)
  }
  for (const task of tasks || []) {
    const orgId = task.organization_id || workspaceOrgById.get(task.workspace_id)
    if (orgId && orgIdSet.has(orgId)) taskOrgById.set(task.id, orgId)
  }
  for (const attachment of taskAttachments || []) mapUrl(urlOrgByKey, attachment.file_url, taskOrgById.get(attachment.task_id))
  for (const profile of profiles || []) mapUrl(urlOrgByKey, profile.avatar_url, profile.organization_id)

  const unattributedByBucket: Record<string, number> = {}
  const unattributedSample: string[] = []
  const storageObjects = await fetchStorageObjects(client)

  for (const object of storageObjects) {
    const bucket = object.bucket_id
    const name = object.name || ''
    const key = `${bucket}/${name}`
    const size = objectSize(object)
    if (size <= 0) continue

    const parts = name.split('/').filter(Boolean)
    const firstPart = parts[0] || ''
    const secondPart = parts[1] || ''
    let orgId = urlOrgByKey.get(key)

    if (!orgId && orgIdSet.has(firstPart)) orgId = firstPart
    if (!orgId && bucket === 'chat-media') orgId = conversationOrgById.get(firstPart)
    if (!orgId && bucket === 'contact-files') {
      orgId = contactOrgById.get(firstPart)
      if (!orgId && firstPart === 'signatures') orgId = signatureOrgById.get(secondPart) || generatedDocOrgById.get(secondPart)
    }
    if (!orgId && bucket === 'avatars') {
      const profileId = firstPart === 'avatars' ? (secondPart || '').split('.')[0] : firstPart.split('-')[0].split('.')[0]
      orgId = profileOrgById.get(profileId) || profileOrgByUserId.get(profileId)
    }
    if (!orgId && bucket === 'contact-avatars') orgId = contactOrgById.get(firstPart) || contactOrgById.get(secondPart)
    if (!orgId && bucket === 'task-files') orgId = taskOrgById.get(firstPart)

    if (orgId && usageByOrg[orgId]) {
      add(usageByOrg[orgId].storage_by_bucket, bucket, size)
      add(usageByOrg[orgId], 'storage_used_bytes', size)
    } else {
      add(unattributedByBucket, bucket, size)
      if (unattributedSample.length < 25) unattributedSample.push(key)
    }
  }

  if (options.persistStorageUsed) {
    await Promise.all(Object.values(usageByOrg).map((usage: any) =>
      client
        .from('organizations')
        .update({ storage_used_bytes: usage.storage_used_bytes })
        .eq('id', usage.organization_id)
    ))
  }

  return {
    organizations: usageByOrg,
    unattributed_storage_bytes: Object.values(unattributedByBucket).reduce((sum, value) => sum + value, 0),
    unattributed_storage_by_bucket: unattributedByBucket,
    unattributed_storage_sample: unattributedSample,
  }
}

export { first, toNumber }
