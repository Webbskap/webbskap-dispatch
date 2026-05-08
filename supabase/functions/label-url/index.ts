// Returns a signed URL for a shipment label (so client can download).
// If the label hasn't been stored yet (e.g. an older booking before label
// extraction worked), falls back to fetching it from postnord_response —
// either inline base64 or via a PostNord-hosted URL — and stores it now.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const POSTNORD_KEY_LIVE = Deno.env.get("POSTNORD_API_KEY") ?? "";
const POSTNORD_KEY_SANDBOX = Deno.env.get("POSTNORD_API_KEY_SANDBOX") ?? "";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractB64(pn: any): string | null {
  const printout = pn?.labelPrintout?.[0]?.printout ?? pn?.labelPrintout?.printout ?? null;
  const candidate = printout?.data ?? printout?.dataValue ?? pn?.label?.pdf ?? pn?.pdf ?? pn?.shipment?.[0]?.label?.pdf;
  if (typeof candidate !== "string" || candidate === "string" || candidate.length < 100) return null;
  return candidate;
}

function extractUrl(pn: any): string | null {
  const printout = pn?.labelPrintout?.[0]?.printout ?? pn?.labelPrintout?.printout ?? null;
  return printout?.uriResource ?? printout?.uriStoreLabel ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResp({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return jsonResp({ error: "unauthorized" }, 401);

    const { shipment_id } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: s } = await admin
      .from("shipments")
      .select("tenant_id, pdf_storage_path, postnord_response")
      .eq("id", shipment_id)
      .single();
    if (!s) return jsonResp({ error: "not_found" }, 404);

    const { data: role } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", u.user.id)
      .eq("tenant_id", s.tenant_id)
      .maybeSingle();
    if (!role) return jsonResp({ error: "forbidden" }, 403);

    let storagePath: string | null = s.pdf_storage_path ?? null;

    // Fallback: try to extract the PDF from the stored PostNord response and
    // upload it now. Rescues older bookings whose label wasn't extracted.
    if (!storagePath) {
      const pn = s.postnord_response;
      let pdfBytes: Uint8Array | null = null;

      const inlineB64 = extractB64(pn);
      if (inlineB64) {
        try {
          pdfBytes = Uint8Array.from(atob(inlineB64), (c) => c.charCodeAt(0));
        } catch (e) {
          console.error("label-url decode error", e);
        }
      }

      if (!pdfBytes) {
        const url = extractUrl(pn);
        if (url) {
          // Sandbox URLs live on atapi2; production on api2. Pick the matching key.
          const apiKey = url.includes("atapi2.postnord.com") ? POSTNORD_KEY_SANDBOX : POSTNORD_KEY_LIVE;
          if (apiKey) {
            try {
              const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(apiKey)}`, {
                headers: { Accept: "application/pdf, application/octet-stream, */*" },
              });
              if (r.ok) {
                const ct = r.headers.get("content-type") ?? "";
                if (ct.includes("application/pdf") || ct.includes("octet-stream")) {
                  pdfBytes = new Uint8Array(await r.arrayBuffer());
                } else {
                  const txt = await r.text();
                  try {
                    const j = JSON.parse(txt);
                    const inner: string | undefined = j?.printout?.data ?? j?.data;
                    if (inner && inner !== "string" && inner.length > 100) {
                      pdfBytes = Uint8Array.from(atob(inner), (c) => c.charCodeAt(0));
                    }
                  } catch { /* not json */ }
                }
              } else {
                console.error("label-url fetch failed", r.status);
              }
            } catch (e) {
              console.error("label-url fetch error", e);
            }
          }
        }
      }

      if (pdfBytes) {
        const path = `${s.tenant_id}/${shipment_id}.pdf`;
        const up = await admin.storage.from("shipment-labels").upload(path, pdfBytes, {
          contentType: "application/pdf", upsert: true,
        });
        if (!up.error) {
          await admin.from("shipments").update({ pdf_storage_path: path }).eq("id", shipment_id);
          storagePath = path;
        } else {
          console.error("label-url storage upload failed", up.error);
        }
      }
    }

    if (!storagePath) return new Response("no_label", { status: 404, headers: corsHeaders });

    const { data: signed } = await admin.storage
      .from("shipment-labels")
      .createSignedUrl(storagePath, 600);
    if (!signed?.signedUrl) return jsonResp({ error: "signed_url_failed" }, 500);

    return jsonResp({ url: signed.signedUrl });
  } catch (e: any) {
    console.error("label-url error", e);
    return jsonResp({ error: String(e?.message ?? e) }, 500);
  }
});
