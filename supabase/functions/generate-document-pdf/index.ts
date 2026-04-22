import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - esm.sh provides pdfmake bundled for browser/deno
import pdfMake from "https://esm.sh/pdfmake@0.2.10/build/pdfmake.min.js";
// @ts-ignore - vfs fonts (Roboto) supports full Latin-1 + special chars
import pdfFonts from "https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js";
// @ts-ignore - html-to-pdfmake converts HTML strings into pdfmake "content" arrays
import htmlToPdfmake from "https://esm.sh/html-to-pdfmake@2.5.18?deps=jsdom@22.1.0";
import { JSDOM } from "https://esm.sh/jsdom@22.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Inject vfs fonts into pdfmake
try {
  // @ts-ignore
  pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts.default?.vfs;
} catch (e) {
  console.warn("pdfmake vfs init warn:", e);
}

// ---- Formatting helpers (sync with src/lib/documentFormatters.ts) ----
function formatFieldValue(value: unknown, fieldType?: string): string {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value);

  switch (fieldType) {
    case "date": {
      // Accept ISO yyyy-MM-dd or dd/MM/yyyy
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
      if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
      const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
      if (brMatch) return str;
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yy = d.getFullYear();
        return `${dd}/${mm}/${yy}`;
      }
      return str;
    }
    case "cpf": {
      const digits = str.replace(/\D/g, "").padStart(11, "0").slice(-11);
      return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    }
    case "cnpj": {
      const digits = str.replace(/\D/g, "").padStart(14, "0").slice(-14);
      return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }
    case "phone":
    case "tel": {
      const digits = str.replace(/\D/g, "");
      if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
      if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
      return str;
    }
    case "currency": {
      const num = Number(str.replace(/[^0-9,.-]/g, "").replace(",", "."));
      if (Number.isFinite(num)) {
        return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      }
      return str;
    }
    default:
      return str;
  }
}

function fillTemplate(
  template: string,
  data: Record<string, unknown>,
  fields: Array<{ name: string; type?: string }> = [],
): string {
  const fieldMap = new Map(fields.map((f) => [f.name, f.type]));
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const v = data[key];
    if (v === undefined || v === null || v === "") return `{{${key}}}`;
    return formatFieldValue(v, fieldMap.get(key));
  });
}

// Convert image URL to data URI (required by pdfmake for embedded images)
async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    const ct = resp.headers.get("content-type") || "image/png";
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const base64 = btoa(binary);
    return `data:${ct};base64,${base64}`;
  } catch (e) {
    console.warn("urlToDataUri fail:", url, e);
    return null;
  }
}

// Wrap plain text content (legacy templates) into minimal HTML
function plainTextToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      template_content,         // legacy plain text
      template_content_html,    // new: HTML from rich editor
      filled_data,
      fields,
      document_name,
      logo_url,
    } = body;

    const rawHtml: string | null =
      (template_content_html && String(template_content_html).trim()) ||
      (template_content && String(template_content).trim()
        ? plainTextToHtml(String(template_content))
        : null);

    if (!rawHtml) {
      return new Response(JSON.stringify({ error: "template_content or template_content_html is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fill placeholders with formatted values
    const filledHtml = fillTemplate(rawHtml, filled_data || {}, fields || []);

    // 2. Convert HTML to pdfmake content using JSDOM
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${filledHtml}</body></html>`);
    const window: any = dom.window;
    const pdfmakeContent = htmlToPdfmake(filledHtml, {
      window,
      defaultStyles: {
        p: { margin: [0, 4, 0, 4] },
        h1: { fontSize: 20, bold: true, margin: [0, 10, 0, 8] },
        h2: { fontSize: 16, bold: true, margin: [0, 8, 0, 6] },
        h3: { fontSize: 14, bold: true, margin: [0, 6, 0, 4] },
        ul: { margin: [0, 4, 0, 4] },
        ol: { margin: [0, 4, 0, 4] },
        table: { margin: [0, 6, 0, 6] },
      },
    });

    // 3. Embed logo (if provided) as data URI
    let logoDataUri: string | null = null;
    if (logo_url) logoDataUri = await urlToDataUri(logo_url);

    // 4. Build pdfmake document definition
    const docDefinition: any = {
      pageSize: "A4",
      pageMargins: [60, logoDataUri ? 110 : 60, 60, 60],
      defaultStyle: {
        font: "Roboto",
        fontSize: 11,
        color: "#1a1a1a",
        lineHeight: 1.4,
      },
      header: logoDataUri
        ? (currentPage: number) => ({
            margin: [60, 30, 60, 0],
            stack: [
              {
                image: logoDataUri!,
                fit: [180, 50],
                alignment: "left",
              },
              {
                canvas: [
                  { type: "line", x1: 0, y1: 5, x2: 475, y2: 5, lineWidth: 0.5, lineColor: "#cccccc" },
                ],
                margin: [0, 8, 0, 0],
              },
            ],
          })
        : undefined,
      footer: (currentPage: number, pageCount: number) => ({
        text: `${currentPage} / ${pageCount}`,
        alignment: "center",
        fontSize: 9,
        color: "#888888",
        margin: [0, 20, 0, 0],
      }),
      content: pdfmakeContent,
    };

    // 5. Render PDF to base64
    const pdfBase64: string = await new Promise((resolve, reject) => {
      try {
        const pdfDocGenerator = pdfMake.createPdf(docDefinition);
        pdfDocGenerator.getBase64((data: string) => resolve(data));
      } catch (err) {
        reject(err);
      }
    });

    // Decode base64 to bytes
    const binary = atob(pdfBase64);
    const pdfBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) pdfBytes[i] = binary.charCodeAt(i);

    // 6. Upload to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const safeName = (document_name || "documento")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `generated/${Date.now()}-${safeName}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("contact-files")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload PDF");
    }

    const { data: urlData } = supabase.storage
      .from("contact-files")
      .getPublicUrl(storagePath);

    return new Response(JSON.stringify({ pdf_url: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-document-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
