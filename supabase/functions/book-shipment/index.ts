// Book shipment via PostNord /v3/edi/labels/pdf
// Authenticated user calls: POST /book-shipment { draft_id }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// Partner-integration: en global API-nyckel för hela plattformen.
// Per-tenant kundnummer (partyId) styr fakturering hos PostNord.
const POSTNORD_PARTNER_KEY = Deno.env.get("POSTNORD_API_KEY") ?? "";
const POSTNORD_PARTNER_KEY_SANDBOX = Deno.env.get("POSTNORD_API_KEY_SANDBOX") ?? "";
const POSTNORD_BASE_LIVE = "https://api2.postnord.com/rest/shipment/v3/edi";
const POSTNORD_BASE_SANDBOX = "https://atapi2.postnord.com/rest/shipment/v3/edi";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Verify user
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { draft_id } = await req.json();
    if (!draft_id) {
      return new Response(JSON.stringify({ error: "missing_draft_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Load draft + order + configs
    const { data: draft, error: dErr } = await admin
      .from("shipment_drafts")
      .select("*, orders(*), tenant_postnord_config:tenant_id(*)")
      .eq("id", draft_id)
      .single();
    if (dErr || !draft) throw dErr ?? new Error("draft_not_found");

    // Verify user has tenant access
    const { data: hasAccess } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userRes.user.id)
      .eq("tenant_id", draft.tenant_id)
      .maybeSingle();
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pnCfg } = await admin
      .from("tenant_postnord_config")
      .select("*")
      .eq("tenant_id", draft.tenant_id)
      .single();
    if (!pnCfg?.api_key) {
      return new Response(JSON.stringify({ error: "postnord_not_configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const order = draft.orders as any;
    const ship = (draft.receiver_override as any) ?? order?.shipping_address ?? {};
    const sender = (draft.sender_override as any) ?? {
      name: pnCfg.sender_name,
      company: pnCfg.sender_company,
      address: pnCfg.sender_address,
      zip: pnCfg.sender_zip,
      city: pnCfg.sender_city,
      country: pnCfg.sender_country ?? "SE",
      phone: pnCfg.sender_phone,
      email: pnCfg.sender_email,
    };

    // Build PostNord EDI Instruction (v3). Body is the ediInstruction itself.
    const ediBody = {
      senderReference: order?.invoice_no ?? order?.webbskap_order_id,
      service: { code: draft.service_code ?? pnCfg.default_service_code ?? "17" },
      consignor: {
        name: sender.company || sender.name,
        contact: { name: sender.name, phone: sender.phone, email: sender.email },
        address: {
          street1: sender.address,
          postCode: sender.zip,
          city: sender.city,
          countryCode: sender.country ?? "SE",
        },
        partyIdentification: { partyId: pnCfg.customer_number },
      },
      consignee: {
        name: ship.name ?? order?.customer_name,
        contact: { name: ship.name ?? order?.customer_name, phone: ship.phone, email: order?.customer_email },
        address: {
          street1: ship.address,
          street2: ship.address2,
          postCode: ship.zipCode,
          city: ship.city,
          countryCode: ship.country ?? "SE",
        },
      },
      parcels: Array.from({ length: draft.parcels ?? 1 }, () => ({
        weight: { value: Number(draft.weight_kg ?? 1), unit: "kg" },
        ...(draft.length_cm && draft.width_cm && draft.height_cm
          ? { dimensions: { length: draft.length_cm, width: draft.width_cm, height: draft.height_cm, unit: "cm" } }
          : {}),
      })),
      additionalServices: draft.additional_services ?? [],
    };

    // PostNord v3: apikey is a query parameter; paperSize controls PDF size.
    const pnUrl = `${POSTNORD_BASE}/labels/pdf?apikey=${encodeURIComponent(pnCfg.api_key)}&paperSize=A4`;
    const pnRes = await fetch(pnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(ediBody),
    });

    const pnText = await pnRes.text();
    let pnJson: any = null;
    try { pnJson = JSON.parse(pnText); } catch { /* not json */ }

    if (!pnRes.ok) {
      await admin.from("shipment_drafts").update({ status: "error" }).eq("id", draft_id);
      return new Response(
        JSON.stringify({ error: "postnord_failed", status: pnRes.status, body: pnJson ?? pnText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract tracking + pdf base64 (field names depend on PostNord contract)
    const trackingNo: string | null =
      pnJson?.shipment?.shipmentId ?? pnJson?.trackingNumber ?? pnJson?.parcels?.[0]?.parcelNumber ?? null;
    const pdfB64: string | null = pnJson?.label?.pdf ?? pnJson?.pdf ?? null;

    let pdfPath: string | null = null;
    if (pdfB64) {
      const bin = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
      const path = `${draft.tenant_id}/${draft.id}.pdf`;
      const up = await admin.storage.from("shipment-labels").upload(path, bin, {
        contentType: "application/pdf", upsert: true,
      });
      if (!up.error) pdfPath = path;
    }

    const { data: shipment } = await admin.from("shipments").insert({
      tenant_id: draft.tenant_id,
      draft_id: draft.id,
      order_id: draft.order_id,
      tracking_no: trackingNo,
      pdf_storage_path: pdfPath,
      postnord_response: pnJson ?? { raw: pnText },
      status: "booked",
    }).select().single();

    await admin.from("shipment_drafts").update({ status: "booked" }).eq("id", draft_id);

    // Push status + tracking back to Webbskap order
    try {
      const { data: wbCfg } = await admin
        .from("tenant_webbskap_config")
        .select("website_api_key")
        .eq("tenant_id", draft.tenant_id)
        .single();
      const { data: tenant } = await admin
        .from("tenants")
        .select("subdomain")
        .eq("id", draft.tenant_id)
        .single();
      if (wbCfg?.website_api_key && tenant?.subdomain && order?.webbskap_order_id) {
        await fetch(`https://${tenant.subdomain}.webbskap.se/api/site/orders/${order.webbskap_order_id}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${wbCfg.website_api_key}`,
            "Content-Type": "application/json",
            "User-Agent": "PostnordPortal/1.0",
          },
          body: JSON.stringify({
            status: "SHIPPED",
            fulfillment: {
              courier: "PostNord",
              trackingNo: trackingNo,
              trackingUrl: trackingNo ? `https://tracking.postnord.com/se/?id=${trackingNo}` : null,
            },
            notifyCustomer: true,
          }),
        });
      }
    } catch (e) {
      console.error("Webbskap PATCH failed", e);
    }

    return new Response(JSON.stringify({ ok: true, shipment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("book-shipment error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
