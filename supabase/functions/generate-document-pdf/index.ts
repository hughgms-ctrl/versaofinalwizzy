import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { template_content, filled_data, document_name, logo_url } = await req.json();
    if (!template_content) {
      return new Response(JSON.stringify({ error: "template_content is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Replace placeholders with filled data
    let finalText = template_content;
    for (const [key, value] of Object.entries(filled_data || {})) {
      finalText = finalText.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }

    // Sanitize text: replace Unicode characters that WinAnsi (StandardFonts) cannot encode
    finalText = finalText
      .replace(/[\u2610]/g, '[ ]')   // ☐ → [ ]
      .replace(/[\u2611]/g, '[x]')   // ☑ → [x]
      .replace(/[\u2612]/g, '[x]')   // ☒ → [x]
      .replace(/[\u2013]/g, '-')     // – (en dash)
      .replace(/[\u2014]/g, '--')    // — (em dash)
      .replace(/[\u2018\u2019]/g, "'") // ' ' → '
      .replace(/[\u201C\u201D]/g, '"') // " " → "
      .replace(/[\u2022]/g, '*')     // • → *
      .replace(/[\u2026]/g, '...')   // … → ...
      .replace(/[\u00A0]/g, ' ')     // non-breaking space
      // Remove any remaining non-WinAnsi characters (keep basic Latin + Latin-1 Supplement)
      .replace(/[^\x00-\xFF]/g, '');

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page settings
    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 60;
    const fontSize = 11;
    const lineHeight = fontSize * 1.5;
    const contentWidth = pageWidth - margin * 2;

    // Embed logo if provided
    let logoImage: any = null;
    let logoWidth = 0;
    let logoHeight = 0;
    if (logo_url) {
      try {
        const logoResp = await fetch(logo_url);
        if (logoResp.ok) {
          const logoBytes = new Uint8Array(await logoResp.arrayBuffer());
          const contentType = logoResp.headers.get("content-type") || "";
          if (contentType.includes("png")) {
            logoImage = await pdfDoc.embedPng(logoBytes);
          } else {
            logoImage = await pdfDoc.embedJpg(logoBytes);
          }
          // Scale logo to fit header
          const maxLogoHeight = 40;
          const maxLogoWidth = 200;
          const scale = Math.min(
            maxLogoWidth / logoImage.width,
            maxLogoHeight / logoImage.height,
            1
          );
          logoWidth = logoImage.width * scale;
          logoHeight = logoImage.height * scale;
        }
      } catch (e) {
        console.error("Logo embed error:", e);
      }
    }

    const headerHeight = logoImage ? logoHeight + 20 : 0;

    // Word-wrap text into lines
    function wrapText(text: string, maxWidth: number, textFont: any, textSize: number): string[] {
      const paragraphs = text.split("\n");
      const allLines: string[] = [];

      for (const para of paragraphs) {
        if (para.trim() === "") {
          allLines.push("");
          continue;
        }
        const words = para.split(/\s+/);
        let currentLine = "";
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = textFont.widthOfTextAtSize(testLine, textSize);
          if (testWidth > maxWidth && currentLine) {
            allLines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) allLines.push(currentLine);
      }
      return allLines;
    }

    const lines = wrapText(finalText, contentWidth, font, fontSize);

    // Calculate lines per page
    const usableHeight = pageHeight - margin * 2 - headerHeight - 30; // 30 for page number
    const linesPerPage = Math.floor(usableHeight / lineHeight);

    // Split lines into pages
    const pages: string[][] = [];
    for (let i = 0; i < lines.length; i += linesPerPage) {
      pages.push(lines.slice(i, i + linesPerPage));
    }

    if (pages.length === 0) pages.push([""]);

    const totalPages = pages.length;

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      // Draw logo header on every page
      if (logoImage) {
        page.drawImage(logoImage, {
          x: margin,
          y: y - logoHeight,
          width: logoWidth,
          height: logoHeight,
        });
        y -= logoHeight + 15;

        // Header separator line
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageWidth - margin, y },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });
        y -= 10;
      }

      // Draw text lines
      const pageLines = pages[pageIdx];
      for (const line of pageLines) {
        if (y < margin + 30) break; // leave room for page number
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font: font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= lineHeight;
      }

      // Page number at bottom
      const pageNumText = `${pageIdx + 1} / ${totalPages}`;
      const pageNumWidth = font.widthOfTextAtSize(pageNumText, 9);
      page.drawText(pageNumText, {
        x: (pageWidth - pageNumWidth) / 2,
        y: margin - 10,
        size: 9,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    const pdfBytes = await pdfDoc.save();

    // Upload to Supabase Storage
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
