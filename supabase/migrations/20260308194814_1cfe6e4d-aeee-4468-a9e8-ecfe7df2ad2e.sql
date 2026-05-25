
-- Populate workspace_id on contacts based on contact_tags matching workspace filter_tag_ids
UPDATE contacts c
SET workspace_id = w.id
FROM contact_tags ct
JOIN workspaces w ON ct.tag_id = ANY(w.filter_tag_ids) AND w.is_active = true
WHERE ct.contact_id = c.id
AND c.workspace_id IS NULL
AND c.organization_id = w.organization_id;

-- Populate workspace_id on conversations based on their contact's workspace_id
UPDATE conversations conv
SET workspace_id = c.workspace_id
FROM contacts c
WHERE conv.contact_id = c.id
AND c.workspace_id IS NOT NULL
AND conv.workspace_id IS NULL;
