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
    const senderPhoneRaw = clean(senderOverride?.phone) ?? clean(pnCfg.sender_phone);
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
    // Normalise sender phone too — PostNord requires E.164 here as well, otherwise
    // they auto-correct it and emit a handlingResponse warning.
    const senderPhone = senderPhoneRaw ? (toE164(senderPhoneRaw, senderCountry) ?? senderPhoneRaw) : undefined;

    if (!consigneeName || !consigneeAddress || !consigneeZip || !consigneeCity) {
      return jsonResp({ error: "consignee_incomplete", details: "Mottagarens namn, adress, postnummer och ort krävs" }, 400);
    }

    // PostNord basic service codes are 2-digit numbers ("17", "18", "19", "86" etc.).
    // Additional service codes start with a letter ("C7", "A3", "F1" etc.). Be defensive:
    // if either column has the wrong type of code, fix it before sending to PostNord.
    const isAdditional = (s: string | null | undefined): boolean => !!s && /^[A-Z]/.test(s);
    const isBasic = (s: string | null | undefined): boolean => !!s && /^\d+$/.test(s);

    let serviceCode = clean(draft.service_code) ?? null;
    let additionalServiceCodes: string[] = Array.isArray(draft.additional_services)
      ? (draft.additional_services as any[])
          .map((s) => (typeof s === "string" ? s : s?.code))
          .filter((s): s is string => typeof s === "string")
      : [];

    // If service_code on the draft is actually an additional service (e.g. "C7"),
    // move it into the additional list and use the config default for the basic code.
    if (serviceCode && isAdditional(serviceCode)) {
      if (!additionalServiceCodes.includes(serviceCode)) {
        additionalServiceCodes.push(serviceCode);
      }
      serviceCode = null;
    }

    // If still no basic code, fall back to the tenant default. Final fallback "17".
    if (!serviceCode || !isBasic(serviceCode)) {
      const cfgDefault = clean(pnCfg.default_service_code);
      serviceCode = cfgDefault && isBasic(cfgDefault) ? cfgDefault : "17";
    }

    // Merge in default additional services from config, deduplicated.
    const cfgAddls: unknown = (pnCfg as any).default_additional_services;
    if (Array.isArray(cfgAddls)) {
      for (const a of cfgAddls) {
        const code = typeof a === "string" ? a : (a as any)?.code;
        if (typeof code === "string" && isAdditional(code) && !additionalServiceCodes.includes(code)) {
          additionalServiceCodes.push(code);
        }
      }
    }

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

    // PostNord requires messageId to be max 36 chars. Use timestamp + short random suffix.
    const messageId = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;

    const perItemWeight = Number((weightKg / parcelCount).toFixed(3));

    // Note: PostNord v3 EDI does not accept item.measurements (length/width/height)
    // — dimensions are not part of the schema for /v3/edi/labels/pdf. They are
    // ignored at the carrier level and rejected by validation if sent.
    const goodsItem = [{
      packageTypeCode: "PC" as const,
      items: Array.from({ length: parcelCount }, () => ({
        itemIdentification: { itemId: "0", itemIdType: "SSCC" as const },
        grossWeight: { value: perItemWeight, unit: "KGM" as const },
      })),
    }];

    const shipment: PostNordShipment = {
      shipmentIdentification: { shipmentId },
      dateAndTimes: { loadingDate },
      // Additional service codes go INSIDE the service object as plain strings
      service: {
        basicServiceCode: serviceCode,
        ...(additionalServiceCodes.length ? { additionalServiceCode: additionalServiceCodes } : {}),
      },
      freeText: [],
      numberOfPackages: { value: parcelCount },
      totalGrossWeight: { value: weightKg, unit: "KGM" },
      // References use referenceNo / referenceType (not referenceCodeQualifier / reference).
      // CU = Customer reference. Shipping Software ID is sent via `application` block, not here.
      references: [
        { referenceNo: senderRef, referenceType: "CU" },
      ],
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
        // deliveryParty is the service point (utlämningsställe) for service 19
        // with additional service A7. partyIdType "156" is PostNord's code for
        // service-point id.
        ...(draft.service_point_id
          ? {
              deliveryParty: {
                partyIdentification: { partyId: String(draft.service_point_id), partyIdType: "156" as const },
                party: {
                  nameIdentification: { name: String(draft.service_point_name ?? "") },
                  address: {
                    streets: [String(draft.service_point_address ?? "")],
                    postalCode: consigneeZip,
                    city: consigneeCity,
                    countryCode: consigneeCountry,
                  },
                },
              },
            }
          : {}),
        // Note: no freightPayer block — PostNord v3 EDI uses consignor.partyIdentification
        // for billing identification. A separate freightPayer is not part of the schema.
      },
      goodsItem,
    };

    const ediBody: PostNordEdiBody = {
      messageDate,
      messageFunction: "Instruction",
      messageId,
      // Application ID is required by PostNord. Use the configured value, or fall back
      // to the well-known sandbox/test value 9999 (per PostNord examples) if not set.
      application: {
        applicationId: POSTNORD_APP_ID > 0 ? POSTNORD_APP_ID : 9999,
        name: POSTNORD_APP_NAME,
        version: POSTNORD_APP_VERSION,
      },
      updateIndicator: "Original",
      shipment: [shipment],
    };

    const allowedFormats = new Set(["A4", "A5", "A6"]);
    const cfgFormat = String((pnCfg as any).default_label_format ?? "A4").toUpperCase();
    const paperSize = allowedFormats.has(cfgFormat) ? cfgFormat : "A4";

    const pnUrl = `${postnordBase(env)}/rest/shipment/v3/edi/labels/pdf?apikey=${encodeURIComponent(apiKey)}&paperSize=${paperSize}`;
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

    // Tracking number (itemId). PostNord puts it in different places depending
    // on the endpoint variant. The /v3/edi/labels/pdf response shape:
    //   bookingResponse.idInformation[*].ids[*]  (idType="itemId")
    // Earlier-style responses also seen:
    //   shipment[*].goodsItem[*].items[*].itemId
    const idsArr: any[] = pnJson?.bookingResponse?.idInformation ?? [];
    const itemIdEntry = idsArr
      .flatMap((info: any) => info?.ids ?? [])
      .find((x: any) => x?.idType === "itemId" || x?.idType === "ITEM_ID");
    const trackingNo: string | null =
      itemIdEntry?.value
      ?? pnJson?.bookingResponse?.idInformation?.[0]?.ids?.[0]?.value
      ?? pnJson?.shipment?.[0]?.goodsItem?.[0]?.items?.[0]?.itemId
      ?? pnJson?.shipment?.[0]?.shipmentId
      ?? pnJson?.shipment?.shipmentId
      ?? pnJson?.parcels?.[0]?.parcelNumber
      ?? pnJson?.trackingNumber
      ?? null;

    // Tracking URL — PostNord usually returns it directly.
    const trackingUrl: string | null =
      idsArr.flatMap((info: any) => info?.urls ?? [])
            .find((u: any) => u?.type === "TRACKING")?.url
      ?? (trackingNo ? `https://tracking.postnord.com/se/?id=${trackingNo}` : null);

    // PDF — first try inline base64 (printout.data), then fall back to a
    // PostNord URL we have to fetch ourselves.
    const printout: any = pnJson?.labelPrintout?.[0]?.printout
      ?? pnJson?.labelPrintout?.printout
      ?? null;
    let pdfB64: string | null =
      printout?.data
      ?? printout?.dataValue
      ?? pnJson?.label?.pdf
      ?? pnJson?.pdf
      ?? pnJson?.shipment?.[0]?.label?.pdf
      ?? null;
    // Reject obvious placeholder values from PostNord schema examples
    if (pdfB64 && (pdfB64 === "string" || pdfB64.length < 100)) pdfB64 = null;

    const labelUrl: string | null =
      printout?.uriResource
      ?? printout?.uriStoreLabel
      ?? null;

    // Resolve to PDF bytes — either from base64 (inline) or by fetching the URL.
    const labelStoragePath = `${draft.tenant_id}/${draft.id}.pdf`;
    let pdfPath: string | null = null;
    let pdfBytes: Uint8Array | null = null;

    if (pdfB64) {
      try {
        pdfBytes = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
      } catch (e) {
        console.error("Label base64 decode error", e);
      }
    } else if (labelUrl) {
      try {
        const r = await fetch(`${labelUrl}${labelUrl.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(apiKey)}`, {
          headers: { Accept: "application/pdf, application/octet-stream, */*" },
        });
        if (r.ok) {
          const ct = r.headers.get("content-type") ?? "";
          if (ct.includes("application/pdf") || ct.includes("octet-stream")) {
            pdfBytes = new Uint8Array(await r.arrayBuffer());
          } else {
            // Some PostNord variants wrap PDF base64 in a JSON envelope at the URL too
            const txt = await r.text();
            try {
              const j = JSON.parse(txt);
              const inner: string | undefined = j?.printout?.data ?? j?.data;
              if (inner && inner !== "string" && inner.length > 100) {
                pdfBytes = Uint8Array.from(atob(inner), (c) => c.charCodeAt(0));
              }
            } catch { /* not JSON */ }
          }
        } else {
          console.error("Label fetch failed", r.status, (await r.text()).slice(0, 500));
        }
      } catch (e) {
        console.error("Label fetch error", e);
      }
    }

    if (pdfBytes) {
      const up = await admin.storage.from("shipment-labels").upload(labelStoragePath, pdfBytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (!up.error) pdfPath = labelStoragePath;
      else console.error("Label storage upload failed", up.error);
    }

    const { data: shipmentRow } = await admin.from("shipments").insert({
      tenant_id: draft.tenant_id,
      draft_id: draft.id,
      order_id: draft.order_id,
      tracking_no: trackingNo,
      pdf_storage_path: pdfPath,
      postnord_response: pnJson ?? { raw: pnText },
      status: "booked",
      service_point_id: draft.service_point_id ?? null,
      service_point_name: draft.service_point_name ?? null,
      service_point_address: draft.service_point_address ?? null,
      service_point_hours: draft.service_point_hours ?? null,
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
          // Loop guard: mark this order so the order_updated webhook fired by
          // our own PATCH doesn't bounce-process. 30s window is plenty for
          // Webbskap to issue and deliver the webhook.
          await admin
            .from("orders")
            .update({ pending_self_update_until: new Date(Date.now() + 30_000).toISOString() })
            .eq("id", order.id);

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
          if (!r.ok) {
            // Clear the guard so a real future order_updated isn't missed
            await admin
              .from("orders")
              .update({ pending_self_update_until: null })
              .eq("id", order.id);
            console.warn("Webbskap PATCH non-OK", { status: r.status, body: await r.text() });
          }
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
