// Shared helper: resolve a public signature token that may belong to either
// `document_signatures` (legacy) or `document_signers` (new multi-signer flow).
// When the token belongs to a `document_signers` row, we lazily ensure a
// matching `document_signatures` row exists so the rest of the signature
// pipeline (OTP, selfie, stamping, receipt) keeps working unchanged.

export interface ResolvedSignature {
  id: string;
  status: string;
  signing_method: string;
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  signer_cpf: string | null;
  organization_id: string;
  generated_document_id: string;
  metadata: Record<string, any>;
  signature_token: string | null;
  expires_at: string | null;
  // Bridge info (when token came from document_signers)
  signer_id?: string | null;
}

function authMetadataFromSigner(signer: any, existingMeta: Record<string, any> = {}) {
  const authMethods = (signer.auth_methods || {}) as Record<string, boolean>;
  const otpChannels: string[] = [];
  if (authMethods.otp_email) otpChannels.push("email");
  if (authMethods.otp_whatsapp) otpChannels.push("whatsapp");
  if (otpChannels.length === 0) {
    if (signer.signer_email) otpChannels.push("email");
    else if (signer.signer_phone) otpChannels.push("whatsapp");
    else otpChannels.push("email");
  }
  return {
    ...existingMeta,
    ...(signer.metadata || {}),
    otp_channel: otpChannels[0],
    otp_channels: otpChannels,
    require_selfie: authMethods.selfie === true,
    auth_methods: authMethods,
    from_signer_id: signer.id,
  };
}

export async function resolveSignatureByToken(
  supabase: any,
  signatureToken: string,
): Promise<ResolvedSignature | null> {
  // 1) Try legacy table first
  const { data: legacy } = await supabase
    .from("document_signatures")
    .select(
      "id, status, signing_method, signer_name, signer_email, signer_phone, signer_cpf, organization_id, generated_document_id, metadata, signature_token, expires_at",
    )
    .eq("signature_token", signatureToken)
    .maybeSingle();

  if (legacy) {
    const legacyMeta = (legacy.metadata || {}) as Record<string, any>;
    if (legacyMeta.from_signer_id) {
      const { data: signer } = await supabase
        .from("document_signers")
        .select("id, status, signer_name, signer_email, signer_phone, signer_cpf, metadata, auth_methods")
        .eq("id", legacyMeta.from_signer_id)
        .maybeSingle();

      if (signer) {
        const updates: Record<string, any> = {
          signer_name: signer.signer_name || legacy.signer_name,
          signer_email: signer.signer_email || legacy.signer_email,
          signer_phone: signer.signer_phone || legacy.signer_phone,
          signer_cpf: signer.signer_cpf || legacy.signer_cpf,
          metadata: authMetadataFromSigner(signer, legacyMeta),
        };
        if (signer.status === "signed" && legacy.status !== "signed") updates.status = "signed";
        await supabase.from("document_signatures").update(updates).eq("id", legacy.id);
        Object.assign(legacy, updates);
      }
    }
    return { ...legacy, metadata: legacy.metadata || {}, signer_id: null } as ResolvedSignature;
  }

  // 2) Try new multi-signer table
  const { data: signer } = await supabase
    .from("document_signers")
    .select(
      "id, status, signing_method, signer_name, signer_email, signer_phone, signer_cpf, organization_id, generated_document_id, metadata, signature_token, signature_id, auth_methods",
    )
    .eq("signature_token", signatureToken)
    .maybeSingle();

  if (!signer) return null;

  const authMethods = (signer.auth_methods || {}) as Record<string, boolean>;
  const signerMeta = authMetadataFromSigner(signer);

  // 3) Reuse existing linked signature, or create one
  if (signer.signature_id) {
    const { data: linked } = await supabase
      .from("document_signatures")
      .select(
        "id, status, signing_method, signer_name, signer_email, signer_phone, signer_cpf, organization_id, generated_document_id, metadata, signature_token, expires_at",
      )
      .eq("id", signer.signature_id)
      .maybeSingle();
    if (linked) {
      // Make sure token, signer data and metadata reflect the latest form submission
      const linkedMeta = (linked.metadata || {}) as Record<string, any>;
      const updates: Record<string, any> = {};
      if (linked.signature_token !== signatureToken) {
        updates.signature_token = signatureToken;
      }
      for (const key of ["signer_name", "signer_email", "signer_phone", "signer_cpf"] as const) {
        if (signer[key] && linked[key] !== signer[key]) updates[key] = signer[key];
      }
      const newMeta = authMetadataFromSigner(signer, linkedMeta);
      const metaChanged = JSON.stringify(linkedMeta) !== JSON.stringify(newMeta);
      if (metaChanged) updates.metadata = newMeta;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("document_signatures")
          .update(updates)
          .eq("id", linked.id);
        Object.assign(linked, updates);
      }
      return { ...linked, metadata: linked.metadata || {}, signer_id: signer.id } as ResolvedSignature;
    }
  }

  // 4) Create a new document_signatures row bridging to this signer
  const insertPayload: any = {
    organization_id: signer.organization_id,
    generated_document_id: signer.generated_document_id,
    signing_method: signer.signing_method || "internal",
    signer_name: signer.signer_name,
    signer_email: signer.signer_email,
    signer_phone: signer.signer_phone,
    signer_cpf: signer.signer_cpf,
    signature_token: signatureToken,
    status: signer.status === "signed" ? "signed" : "pending",
    metadata: signerMeta,
  };

  const { data: created, error: createErr } = await supabase
    .from("document_signatures")
    .insert(insertPayload)
    .select(
      "id, status, signing_method, signer_name, signer_email, signer_phone, signer_cpf, organization_id, generated_document_id, metadata, signature_token, expires_at",
    )
    .single();

  if (createErr || !created) {
    console.error("[signerBridge] Failed to create bridged signature:", createErr);
    return null;
  }

  await supabase
    .from("document_signers")
    .update({ signature_id: created.id })
    .eq("id", signer.id);

  return { ...created, metadata: created.metadata || {}, signer_id: signer.id } as ResolvedSignature;
}

// After a successful sign, propagate status back to the signer row.
export async function markSignerSigned(
  supabase: any,
  signatureId: string,
  signedAt: string,
): Promise<void> {
  await supabase
    .from("document_signers")
    .update({ status: "signed", signed_at: signedAt })
    .eq("signature_id", signatureId);
}
