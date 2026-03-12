import { corsHeaders, handleCors, errorResponse } from "../_shared/middleware.ts";

const SENTRY_DSN =
  Deno.env.get("SENTRY_DSN") ||
  "https://e182c0b36f3c05825b22c0b0c5743cab@o4511028911734784.ingest.us.sentry.io/4511028921761792";

const dsnMatch = SENTRY_DSN.match(
  /^https:\/\/([a-zA-Z0-9]+)@o(\d+)\.ingest\.([a-zA-Z0-9-]+)\.sentry\.io\/(\d+)$/,
);

if (!dsnMatch) {
  console.error("Invalid SENTRY_DSN format");
}

const [, publicKey, orgId, region, projectId] = dsnMatch || [];
const sentryEnvelopeUrl = dsnMatch
  ? `https://o${orgId}.ingest.${region}.sentry.io/api/${projectId}/envelope/`
  : "";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  if (!sentryEnvelopeUrl) {
    return errorResponse("Sentry tunnel not configured", 500);
  }

  try {
    const envelope = await req.text();

    if (!envelope) {
      return errorResponse("Missing envelope body", 400);
    }

    const response = await fetch(sentryEnvelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: envelope,
    });

    const responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") || "text/plain",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tunnel error";
    console.error("[sentry-tunnel]", message);
    return errorResponse(message, 500);
  }
});
