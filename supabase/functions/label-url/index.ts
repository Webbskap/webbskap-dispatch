// Returns a signed URL for a shipment label (so client can download)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response("unauthorized", { status: 401, headers: corsHeaders });

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response("unauthorized", { status: 401, headers: corsHeaders });

    const { shipment_id } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: s } = await admin.from("shipments").select("tenant_id,pdf_storage_path").eq("id", shipment_id).single();
    if (!s?.pdf_storage_path) return new Response("no_label", { status: 404, headers: corsHeaders });

    const { data: role } = await admin.from("user_roles").select("id")
      .eq("user_id", u.user.id).eq("tenant_id", s.tenant_id).maybeSingle();
    if (!role) return new Response("forbidden", { status: 403, headers: corsHeaders });

    const { data: signed } = await admin.storage.from("shipment-labels").createSignedUrl(s.pdf_storage_path, 600);
    return new Response(JSON.stringify({ url: signed?.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
