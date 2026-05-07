// Book shipment via PostNord /rest/shipment/v3/edi/labels/pdf
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type IssuerCode,
  type PostNordEdiBody,
  type PostNordShipment,
  clean,
  firstNonEmpty,
  isValidCustomerNumber,
  issuerFromCountry,
  postnordBase,
  validateServiceRules,
} from "../_shared/postnord.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const POSTNORD_PARTNER_KEY_LIVE = Deno.env.get("POSTNORD_API_KEY") ?? "";
const POSTNORD_PARTNER_KEY_SANDBOX = Deno.env.get("POSTNORD_API_KEY_SANDBOX") ?? "";

const POSTNORD_APP_ID = Number(Deno.env.get("POSTNORD_APP_ID") ?? "0");
const POSTNORD_APP_NAME = Deno.env.get("POSTNORD_APP_NAME") ?? "Webbskap PostNord Portal";
const POSTNORD_APP_VERSION = Deno.env.get("POSTNORD_APP_VERSION") ?? "1.0.0";

const WEBBSKAP_PLATFORM_KEY = Deno.env.get("WEBBSKAP_PLATFORM_KEY") ?? "";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return jsonResp({ error: "unauthorized" }, 401);

    const { draft_id } = await req.json();
    if (!draft_id) return jsonResp({ error: "missing_draft_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: draft, error: dErr } = await admin
      .from("shipment_drafts")
      .select("*, orders(*)")
      .eq("id", draft_id)
      .single();
    if (dErr || !draft) return jsonResp({ error: "draft_not_found" }, 404);

    const { data: hasAccess } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userRes.user.id)
      .eq("tenant_id", draft.tenant_id)
      .maybeSingle();
    if (!hasAccess) return jsonResp({ error: "forbidden" }, 403);

    if (draft.status === "booked") {
      const { data: existing } = await admin
        .from("shipments")
        .select("*")
        .eq("draft_id", draft_id)
        .maybeSingle();
      if (existing) return jsonResp({ ok: true, shipment: existing, already_booked: true });
    }

    const { data: pnCfg } = await admin
      .from("tenant_postnord_config")
      .select("*")
      .eq("tenant_id", draft.tenant_id)
      .single();

    if (!pnCfg) {
      return jsonResp({ error: "postnord_not_configured", details: "PostNord-uppgifter saknas helt" }, 400);
    }

    const env = (pnCfg.environment ?? "sandbox") as "sandbox" | "live";
    const partnerKey = env === "live" ? POSTNORD_PARTNER_KEY_LIVE : POSTNORD_PARTNER_KEY_SANDBOX;
    const apiKey = pnCfg.api_key || partnerKey;
    if (!apiKey) {
      return jsonResp({ error: "postnord_not_configured", details: "API-nyckel saknas" }, 400);
    }
    if (!pnCfg.customer_number) {
      return jsonResp({ error: "postnord_not_configured", details: "Kundnummer saknas" }, 400);
    }
    if (env === "live" && POSTNORD_APP_ID <= 0) {
      return jsonResp({
        error: "postnord_not_configured",
        details: "POSTNORD_APP_ID är inte satt. Kontakta kundintegration.se@postnord.com för att få ert Shipping Software ID innan ni går live.",
      }, 500);
    }

    const issuer: IssuerCode = issuerFromCountry(pnCfg.sender_country);

    if (!isValidCustomerNumber(pnCfg.customer_number, issuer)) {
      return jsonResp({
        error: "invalid_customer_number",
        details: `Kundnummer ${pnCfg.customer_number} har fel längd för issuer ${issuer}.`,
      }, 400);
    }

    const order = draft.orders as any;
    if (!order) return jsonResp({ error: "order_not_found" }, 500);

    if (order.requires_shipping === false) {
      return jsonResp({ error: "order_not_shippable", details: "Ordern kräver inte frakt." }, 400);
    }

    const ship = (draft.receiver_override as any) ?? order.shipping_address ?? {};
    const senderOverride = draft.sender_override as any;

    const senderName = clean(senderOverride?.name) ?? clean(pnCfg.sender_name);
    const senderCompany = clean(senderOverride?.company) ?? clean(pnCfg.sender_company);
    const senderAddress = clean(senderOverride?.address) ?? clean(pnCfg.sender_address);
    const senderZip = clean(senderOverride?.zip) ?? clean(pnCfg.sender_zip);
    const senderCity = clean(senderOverride?.city) ?? clean(pnCfg.sender_city);
    const senderCountry = (clean(senderOverride?.country) ?? clean(pnCfg.sender_country) ?? "SE").toUpperCase();
    const senderPhone = clean(senderOverride?.phone) ?? clean(pnCfg.sender_phone);
    const senderEmail = clean(senderOverride?.email) ?? clean(pnCfg.sender_email);

    if (!senderAddress || !senderZip || !senderCity) {
      return jsonResp({ error: "sender_incomplete", details: "Avsändaradress, postnummer och ort krävs" }, 400);
    }
    if (!senderName && !senderCompany) {
      return jsonResp({ error: "sender_incomplete", details: "Avsändarnamn eller företagsnamn krävs" }, 400);
    }

    const consigneeName = firstNonEmpty(ship.name, order.customer_name);
    const consigneeAddress = clean(ship.address);
    const consigneeZip = clean(ship.zipCode);
    const consigneeCity = clean(ship.city);
    const consigneeCountry = (clean(ship.country) ?? "SE").toUpperCase();
    const consigneePhone = clean(ship.phone);
    const consigneeEmail = clean(order.customer_email);

    const COUNTRY_CALLING_CODES: Record<string, string> = { SE: "46", DK: "45", NO: "47", FI: "358" };
    const toE164 = (raw: string, country: string): string | undefined => {
      const digits = raw.replace(/[\s().-]/g, "");
      if (digits.startsWith("+") && /^\+\d{6,}$/.test(digits)) return digits;
      if (digits.startsWith("00") && /^00\d{6,}$/.test(digits)) return "+" + digits.slice(2);
      const cc = COUNTRY_CALLING_CODES[country];
      if (cc && /^0\d{6,}$/.test(digits)) return "+" + cc + digits.slice(1);
      return undefined;
    };
    const consigneeSms = consigneePhone ? toE164(consigneePhone, consigneeCountry) : undefined;

    if (!consigneeName || !consigneeAddress || !consigneeZip || !consigneeCity) {
      return jsonResp({ error: "consignee_incomplete", details: "Mottagarens namn, adress, postnummer och ort krävs" }, 400);
    }

    const serviceCode = clean(draft.service_code) ?? clean(pnCfg.default_service_code) ?? "17";
    const additionalServiceCodes: string[] = Array.isArray(draft.additional_services)
      ? (draft.additional_services as any[]).map((s) => (typeof s === "string" ? s : s?.code)).filter((s): s is string => typeof s === "string")
      : [];

    const ruleErr = validateServiceRules(
      serviceCode,
      additionalServiceCodes,
      { emailAddress: consigneeEmail, smsNo: consigneeSms, phoneNo: consigneePhone },
      consigneeCountry,
    );
    if (ruleErr) return jsonResp({ error: "service_rules_violation", details: ruleErr }, 400);

    const weightKg = Number(draft.weight_kg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      return jsonResp({ error: "missing_weight", details: "Ange vikt större än 0 innan bokning." }, 400);
    }
    const parcelCount = Math.max(1, Math.floor(Number(draft.parcels ?? 1)));

    const now = new Date();
    const messageDate = now.toISOString();
    const loadingDate = messageDate;

    const senderRef = String(order.invoice_no ?? order.webbskap_order_id ?? draft.id);
    const shipmentId = "0";

    const itemDimensions = (draft.length_cm && draft.width_cm && draft.height_cm)
      ? {
          length: { value: Number(draft.length_cm), unit: "CMT" as const },
          width: { value: Number(draft.width_cm), unit: "CMT" as const },
          height: { value: Number(draft.height_cm), unit: "CMT" as const },
        }
      : undefined;

    const perItemWeight = Number((weightKg / parcelCount).toFixed(3));

    const goodsItem = [{
      packageTypeCode: "PC" as const,
      items: Array.from({ length: parcelCount }, () => ({
        itemIdentification: { itemId: "0", itemIdType: "SSCC" as const },
        grossWeight: { value: perItemWeight, unit: "KGM" as const },
        ...(itemDimensions ? { measurements: itemDimensions } : {}),
      })),
    }];

    const shipment: PostNordShipment = {
      shipmentIdentification: { shipmentId },
      dateAndTimes: { loadingDate },
      service: { basicServiceCode: serviceCode },
      ...(additionalServiceCodes.length
        ? { additionalServices: additionalServiceCodes.map((code) => ({ additionalServiceCode: code })) }
        : {}),
      numberOfPackages: { value: parcelCount },
      totalGrossWeight: { value: weightKg, unit: "KGM" },
      parties: {
        consignor: {
          issuerCode: issuer,
          partyIdentification: { partyId: pnCfg.customer_number, partyIdType: "160" },
          party: {
            nameIdentification: { name: senderCompany ?? senderName ?? "" },
            address: {
              streets: [senderAddress],
              postalCode: senderZip,
              city: senderCity,
              countryCode: senderCountry,
            },
            ...(senderName || senderPhone || senderEmail
              ? {
                  contact: {
                    ...(senderName ? { contactName: senderName } : {}),
                    ...(senderPhone ? { phoneNo: senderPhone } : {}),
                    ...(senderEmail ? { emailAddress: senderEmail } : {}),
                  },
                }
              : {}),
          },
        },
        consignee: {
          party: {
            nameIdentification: { name: consigneeName! },
            address: {
              streets: [consigneeAddress, ...(clean(ship.address2) ? [ship.address2 as string] : [])],
              postalCode: consigneeZip,
              city: consigneeCity,
              countryCode: consigneeCountry,
            },
            contact: {
              contactName: consigneeName!,
              ...(consigneeEmail ? { emailAddress: consigneeEmail } : {}),
              ...(consigneeSms ? { smsNo: consigneeSms } : {}),
              ...(consigneePhone && !consigneeSms ? { phoneNo: consigneePhone } : {}),
            },
          },
        },
        freightPayer: {
          issuerCode: issuer,
          partyIdentification: { partyId: pnCfg.customer_number, partyIdType: "160" },
        },
      },
      goodsItem,
      ...(POSTNORD_APP_ID > 0
        ? {
            references: [
              { referenceCodeQualifier: "AGK", reference: String(POSTNORD_APP_ID) },
              { referenceCodeQualifier: "CU", reference: senderRef },
            ],
          }
        : { references: [{ referenceCodeQualifier: "CU", reference: senderRef }] }),
    };

    const ediBody: PostNordEdiBody = {
      messageDate,
      messageFunction: "Instruction",
      messageId: `${draft.tenant_id}-${draft.id}-${now.getTime()}`,
      application: {
        applicationId: POSTNORD_APP_ID,
        name: POSTNORD_APP_NAME,
        version: POSTNORD_APP_VERSION,
      },
      updateIndicator: "Original",
      shipment: [shipment],
    };

    const pnUrl = `${postnordBase(env)}/rest/shipment/v3/edi/labels/pdf?apikey=${encodeURIComponent(apiKey)}&paperSize=A4`;
    const pnRes = await fetch(pnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(ediBody),
    });

    const pnText = await pnRes.text();
    let pnJson: any = null;
    try { pnJson = JSON.parse(pnText); } catch { /* not json */ }

    if (!pnRes.ok) {
      await admin.from("shipment_drafts").update({ status: "error" }).eq("id", draft_id);
      console.error("PostNord booking failed", { status: pnRes.status, body: pnJson ?? pnText });
      return jsonResp({
        error: "postnord_failed",
        status: pnRes.status,
        body: pnJson ?? pnText,
        message: pnJson?.compositeFault?.faults?.[0]?.explanationText ?? pnJson?.message ?? "PostNord avvisade bokningen.",
      }, 502);
    }

    const trackingNo: string | null =
      pnJson?.shipment?.[0]?.shipmentId
      ?? pnJson?.shipment?.shipmentId
      ?? pnJson?.parcels?.[0]?.parcelNumber
      ?? pnJson?.shipment?.[0]?.goodsItem?.[0]?.items?.[0]?.itemId
      ?? pnJson?.trackingNumber
      ?? null;
    const pdfB64: string | null =
      pnJson?.label?.pdf
      ?? pnJson?.pdf
      ?? pnJson?.shipment?.[0]?.label?.pdf
      ?? null;

    let pdfPath: string | null = null;
    if (pdfB64) {
      try {
        const bin = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
        const path = `${draft.tenant_id}/${draft.id}.pdf`;
        const up = await admin.storage.from("shipment-labels").upload(path, bin, {
          contentType: "application/pdf", upsert: true,
        });
        if (!up.error) pdfPath = path;
        else console.error("Label upload failed", up.error);
      } catch (e) {
        console.error("Label decode/upload error", e);
      }
    }

    const { data: shipmentRow } = await admin.from("shipments").insert({
      tenant_id: draft.tenant_id,
      draft_id: draft.id,
      order_id: draft.order_id,
      tracking_no: trackingNo,
      pdf_storage_path: pdfPath,
      postnord_response: pnJson ?? { raw: pnText },
      status: "booked",
    }).select().single();

    await admin.from("shipment_drafts").update({ status: "booked" }).eq("id", draft_id);

    try {
      const { data: tenant } = await admin
        .from("tenants")
        .select("subdomain")
        .eq("id", draft.tenant_id)
        .single();

      const { data: wbCfg } = await admin
        .from("tenant_webbskap_config")
        .select("website_api_key")
        .eq("tenant_id", draft.tenant_id)
        .maybeSingle();

      if (tenant?.subdomain && order.webbskap_order_id) {
        const websiteKey = wbCfg?.website_api_key ?? "";
        const authHeaders: Record<string, string> = WEBBSKAP_PLATFORM_KEY
          ? { "X-Platform-Key": WEBBSKAP_PLATFORM_KEY }
          : websiteKey
            ? { "Authorization": `Bearer ${websiteKey}` }
            : {};

        if (Object.keys(authHeaders).length) {
          const r = await fetch(
            `https://${tenant.subdomain}.webbskap.se/api/site/orders/${order.webbskap_order_id}`,
            {
              method: "PATCH",
              headers: { ...authHeaders, "Content-Type": "application/json", "User-Agent": "PostnordPortal/1.0" },
              body: JSON.stringify({
                status: "SHIPPED",
                fulfillment: {
                  courier: "PostNord",
                  trackingNo: trackingNo,
                  trackingUrl: trackingNo ? `https://tracking.postnord.com/se/?id=${trackingNo}` : null,
                },
                notifyCustomer: true,
              }),
            },
          );
          if (!r.ok) console.warn("Webbskap PATCH non-OK", { status: r.status, body: await r.text() });
        } else {
          console.warn("Webbskap PATCH skipped — no auth");
        }
      } else {
        console.warn("Webbskap PATCH skipped — no subdomain on tenant");
      }
    } catch (e) {
      console.error("Webbskap PATCH failed", e);
    }

    return jsonResp({ ok: true, shipment: shipmentRow });
  } catch (e: any) {
    console.error("book-shipment unhandled error", e);
    return jsonResp({ error: String(e?.message ?? e) }, 500);
  }
});
