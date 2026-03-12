# Wizzy AI — API Reference

> Edge Functions hosted on Supabase  
> Base URL: `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1`

## Authentication

Most endpoints require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <supabase_jwt>
```

Webhook endpoints (`zapi-webhook`) use token-based validation instead.

---

## WhatsApp

### POST /zapi-send-message
Send a message through WhatsApp.

**Auth**: Required  
**Body**:
```json
{
  "conversationId": "uuid",
  "content": "Hello!",
  "type": "text|image|audio|document",
  "mediaUrl": "https://... (optional)"
}
```

### POST /zapi-webhook
Receive incoming WhatsApp messages (called by Z-API).

**Auth**: Token-based (`x-webhook-token` or `x-api-key`)  
**Body**: Z-API webhook payload

### POST /zapi-sync-chats
Sync chat list from WhatsApp instance.

**Auth**: Required  
**Body**:
```json
{ "instanceId": "uuid" }
```

### POST /zapi-sync-messages
Sync messages for a specific conversation.

**Auth**: Required  
**Body**:
```json
{
  "conversationId": "uuid",
  "instanceId": "uuid"
}
```

### POST /zapi-check-status
Check WhatsApp instance connection status.

**Auth**: Required  
**Body**:
```json
{ "instanceId": "uuid" }
```

---

## AI & Automation

### POST /agent-orchestrator
Execute AI agent response for a conversation.

**Auth**: Required  
**Body**:
```json
{
  "conversationId": "uuid",
  "message": "Customer message",
  "agentId": "uuid"
}
```

### POST /flow-execute
Execute a flow for a conversation.

**Auth**: Required  
**Body**:
```json
{
  "flowId": "uuid",
  "conversationId": "uuid",
  "triggerData": {}
}
```

### POST /analyze-conversation
Get AI analysis of a conversation.

**Auth**: Required  
**Body**:
```json
{ "conversationId": "uuid" }
```

---

## Documents

### POST /generate-document-pdf
Generate PDF from a filled template.

**Auth**: Required  
**Body**:
```json
{
  "documentId": "uuid",
  "templateId": "uuid",
  "data": { "field1": "value1" }
}
```

### POST /capture-signature
Record a digital signature.

**Auth**: Token-based (signature_token)  
**Body**:
```json
{
  "signatureId": "uuid",
  "signatureData": "base64...",
  "signerInfo": { "name": "...", "cpf": "..." }
}
```

---

## Calendar

### POST /google-calendar-auth
Handle Google OAuth callback for calendar.

### POST /google-calendar-availability
Get available time slots.

**Auth**: Required  
**Body**:
```json
{
  "organizationId": "uuid",
  "date": "2026-03-15"
}
```

### POST /google-calendar-book
Book a calendar appointment.

**Auth**: Public (via booking slug)  
**Body**:
```json
{
  "slug": "booking-slug",
  "startsAt": "2026-03-15T10:00:00Z",
  "clientName": "João",
  "clientPhone": "5511999999999"
}
```

---

## Admin

### POST /admin-dashboard
Get platform-wide statistics.

**Auth**: Required (platform_admin role)

### POST /admin-governance
Manage governance prompts and maturity scores.

**Auth**: Required (platform_admin role)

---

## Error Responses

All endpoints return consistent error format:
```json
{
  "error": "Error description",
  "details": "Additional context (optional)"
}
```

| Status | Meaning |
|:---|:---|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 500 | Internal Server Error |
