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
  // Determine OTP channel from auth_methods preferences
  const otpChannel = authMethods.otp_whatsapp
    ? "whatsapp"
    : authMethods.otp_email
      ? "email"
      : "email";
  const requireSelfie = authMethods.selfie === true;

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
      // Make sure token matches and metadata is up-to-date
      if (linked.signature_token !== signatureToken) {
        await supabase
          .from("document_signatures")
          .update({ signature_token: signatureToken })
          .eq("id", linked.id);
        linked.signature_token = signatureToken;
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
    metadata: {
      ...(signer.metadata || {}),
      otp_channel: otpChannel,
      require_selfie: requireSelfie,
      auth_methods: authMethods,
      from_signer_id: signer.id,
    },
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
