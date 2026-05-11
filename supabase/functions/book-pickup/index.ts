// Book a pickup with PostNord via /rest/shipment/v3/pickups
// EDI Instruction format with messageFunction: "PickupBooking".
// Supports two flows:
//   1. Standalone pickup: client sends pickup details directly
//   2. Per-shipment pickup: client sends shipment_id; we derive defaults from
//      the shipment + tenant_postnord_config, link the resulting
//      pickup_booking back via shipments.pickup_booking_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  clean,
  firstNonEmpty,
  isValidCustomerNumber,
  issuerFromCountry,
  postnordBase,
  type IssuerCode,
  type PostNordEdiBody,
  type PostNordParty,
  type PostNordShipment,
} from "../_shared/postnord.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const POSTNORD_PARTNER_KEY_LIVE = Deno.env.get("POSTNORD_API_KEY") ?? "";
const POSTNORD_PARTNER_KEY_SANDBOX = Deno.env.get("POSTNORD_API_KEY_SANDBOX") ?? "";
const POSTNORD_APP_ID = Number(Deno.env.get("POSTNORD_APP_ID") ?? "0");
const POSTNORD_APP_NAME = Deno.env.get("POSTNORD_APP_NAME") ?? "Webbskap PostNord Portal";
const POSTNORD_APP_VERSION = Deno.env.get("POSTNORD_APP_VERSION") ?? "1.0.0";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const COUNTRY_CALLING_CODES: Record<string, string> = { SE: "46", DK: "45", NO: "47", FI: "358" };
function toE164(raw: string | undefined | null, country: string): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/[\s().-]/g, "");
  if (digits.startsWith("+") && /^\+\d{6,}$/.test(digits)) return digits;
  if (digits.startsWith("00") && /^00\d{6,}$/.test(digits)) return "+" + digits.slice(2);
  const cc = COUNTRY_CALLING_CODES[country];
  if (cc && /^0\d{6,}$/.test(digits)) return "+" + cc + digits.slice(1);
  return undefined;
}

interface PickupInput {
  // Either a shipment_id (per-order flow) OR explicit fields (standalone)
  shipment_id?: string;
  pickup_date: string;       // "YYYY-MM-DD"
  pickup_type?: "p1" | "p2"; // p1=biz, p2=private. Default p2.
  instruction: string;
  parcels?: number;
  total_weight_kg?: number;
  reference?: string;

  // Optional pickup-address overrides — when omitted we use tenant config
  pickup_name?: string;
  pickup_company?: string;
  pickup_address?: string;
  pickup_zip?: string;
  pickup_city?: string;
  pickup_country?: string;
  pickup_phone?: string;
  pickup_email?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return jsonResp({ error: "unauthorized" }, 401);
    const userId = userRes.user.id;

    const input = (await req.json()) as PickupInput;
    console.log("book-pickup invoked", { userId, shipment_id: input?.shipment_id, pickup_date: input?.pickup_date, pickup_type: input?.pickup_type, parcels: input?.parcels, total_weight_kg: input?.total_weight_kg, has_address_override: !!(input?.pickup_address || input?.pickup_zip || input?.pickup_city) });
    if (!input?.pickup_date) { console.warn("missing_pickup_date"); return jsonResp({ error: "missing_pickup_date" }, 400); }
    if (!input?.instruction || !input.instruction.trim()) {
      console.warn("missing_instruction");
      return jsonResp({ error: "missing_instruction", details: "Skriv en upphämtningsinstruktion." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Resolve tenant — either via shipment or via user's only tenant
    let tenantId: string | null = null;
    let linkedShipment: any = null;
    if (input.shipment_id) {
      const { data: ship } = await admin
        .from("shipments")
        .select("id, tenant_id, weight_kg, parcels, pickup_booking_id, order_id")
        .eq("id", input.shipment_id)
        .single();
      if (!ship) return jsonResp({ error: "shipment_not_found" }, 404);
      tenantId = ship.tenant_id;
      linkedShipment = ship;
      if (ship.pickup_booking_id) {
        return jsonResp({
          error: "shipment_already_has_pickup",
          details: "Den här försändelsen har redan en upphämtning bokad.",
        }, 400);
      }
    } else {
      // Standalone — look up user's tenant
      const { data: role } = await admin
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      tenantId = role?.tenant_id ?? null;
    }
    if (!tenantId) return jsonResp({ error: "tenant_not_found" }, 404);

    // Access check
    const { data: access } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!access) return jsonResp({ error: "forbidden" }, 403);

    // PostNord config
    const { data: pnCfg } = await admin
      .from("tenant_postnord_config")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!pnCfg) {
      console.warn("postnord_not_configured (no row)", { tenantId });
      return jsonResp({ error: "postnord_not_configured", details: "PostNord-uppgifter saknas helt" }, 400);
    }
    const env = (pnCfg.environment ?? "sandbox") as "sandbox" | "live";
    const partnerKey = env === "live" ? POSTNORD_PARTNER_KEY_LIVE : POSTNORD_PARTNER_KEY_SANDBOX;
    const apiKey = pnCfg.api_key || partnerKey;
    if (!apiKey) { console.warn("missing api_key", { env, hasPartnerKey: !!partnerKey }); return jsonResp({ error: "postnord_not_configured", details: "API-nyckel saknas" }, 400); }
    if (!pnCfg.customer_number) {
      console.warn("missing customer_number");
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
      console.warn("invalid_customer_number", { customer_number: pnCfg.customer_number, issuer });
      return jsonResp({
        error: "invalid_customer_number",
        details: `Kundnummer ${pnCfg.customer_number} har fel längd för issuer ${issuer}.`,
      }, 400);
    }

    // Pickup-API only supports pickup from SE/FI/DK (and the consignor must
    // match those for the "0" domestic code).
    const senderCountry = (clean(pnCfg.sender_country) ?? "SE").toUpperCase();
    if (!["SE", "FI", "DK"].includes(senderCountry)) {
      return jsonResp({
        error: "country_not_supported",
        details: `Pickup-API:t stödjer endast SE, FI och DK. Din avsändaradress är i ${senderCountry}.`,
      }, 400);
    }

    // Pickup-type — default p2 (private address)
    const pickupType: "p1" | "p2" = input.pickup_type === "p1" ? "p1" : "p2";

    // Resolve pickup address — input override OR tenant config
    const addr = {
      name: firstNonEmpty(input.pickup_name, pnCfg.sender_name) ?? "",
      company: firstNonEmpty(input.pickup_company, pnCfg.sender_company),
      address: firstNonEmpty(input.pickup_address, pnCfg.sender_address) ?? "",
      zip: firstNonEmpty(input.pickup_zip, pnCfg.sender_zip) ?? "",
      city: firstNonEmpty(input.pickup_city, pnCfg.sender_city) ?? "",
      country: (firstNonEmpty(input.pickup_country, pnCfg.sender_country) ?? "SE").toUpperCase(),
      phoneRaw: firstNonEmpty(input.pickup_phone, pnCfg.sender_phone),
      email: firstNonEmpty(input.pickup_email, pnCfg.sender_email),
    };
    if (!addr.address || !addr.zip || !addr.city) {
      console.warn("pickup_address_incomplete", addr);
      return jsonResp({
        error: "pickup_address_incomplete",
        details: "Adress, postnummer och ort krävs för upphämtning.",
      }, 400);
    }
    if (!addr.name && !addr.company) {
      console.warn("pickup_address_incomplete (no name)", addr);
      return jsonResp({
        error: "pickup_address_incomplete",
        details: "Namn eller företagsnamn krävs.",
      }, 400);
    }
    // PostNord requires a contact method (email or phone/sms) for the pickup party
    const phoneE164 = toE164(addr.phoneRaw, addr.country);
    if (!addr.email && !phoneE164) {
      console.warn("pickup_contact_required", { phoneRaw: addr.phoneRaw, email: addr.email });
      return jsonResp({
        error: "pickup_contact_required",
        details: "Antingen e-post eller telefonnummer krävs för upphämtningskontakten.",
      }, 400);
    }

    // Weight / parcels — explicit input takes precedence, otherwise derive
    // from the linked shipment if any
    const parcels = Math.max(1, Math.floor(Number(input.parcels ?? linkedShipment?.parcels ?? 1)));
    const totalWeight = Number(input.total_weight_kg ?? linkedShipment?.weight_kg ?? 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      return jsonResp({ error: "missing_weight", details: "Ange vikt större än 0." }, 400);
    }

    console.log("book-pickup proceeding to PostNord", { env, senderCountry, parcels, totalWeight, pickupType, addrSummary: { city: addr.city, country: addr.country, hasEmail: !!addr.email, hasPhone: !!phoneE164 } });

    // Persist the booking row up-front (status=pending) so we have audit even if PostNord call fails
    const { data: bookingRow, error: insErr } = await admin
      .from("pickup_bookings")
      .insert({
        tenant_id: tenantId,
        pickup_date: input.pickup_date,
        pickup_type: pickupType,
        instruction: input.instruction.trim(),
        parcels,
        total_weight_kg: totalWeight,
        reference: clean(input.reference),
        pickup_name: addr.name || addr.company || "",
        pickup_company: addr.company,
        pickup_address: addr.address,
        pickup_zip: addr.zip,
        pickup_city: addr.city,
        pickup_country: addr.country,
        pickup_phone: phoneE164,
        pickup_email: addr.email,
        status: "pending",
      })
      .select()
      .single();
    if (insErr || !bookingRow) {
      console.error("pickup_bookings insert failed", insErr);
      return jsonResp({ error: "db_insert_failed", details: insErr?.message }, 500);
    }

    // Build EDI PickupBooking body
    const now = new Date();
    const messageId = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    // Convert "YYYY-MM-DD" to ISO at start of day
    const earliestPickupDateISO = new Date(input.pickup_date + "T00:00:00Z").toISOString();

    const consignor: PostNordParty = {
      issuerCode: issuer,
      partyIdentification: { partyId: pnCfg.customer_number, partyIdType: "160" },
      party: {
        nameIdentification: { name: addr.company || addr.name },
        address: {
          streets: [addr.address],
          postalCode: addr.zip.replace(/\s+/g, ""),
          city: addr.city,
          countryCode: addr.country,
        },
        contact: {
          ...(addr.name ? { contactName: addr.name } : {}),
          ...(phoneE164 ? { phoneNo: phoneE164, smsNo: phoneE164 } : {}),
          ...(addr.email ? { emailAddress: addr.email } : {}),
        },
      },
    };

    const shipment: PostNordShipment = {
      shipmentIdentification: { shipmentId: "0" },
      dateAndTimes: { earliestPickupDate: earliestPickupDateISO },
      service: {
        basicServiceCode: "0",
        additionalServiceCode: [pickupType],
      },
      freeText: [{ usageCode: "ADS", text: input.instruction.trim() }],
      ...(input.reference
        ? { references: [{ referenceNo: input.reference.trim(), referenceType: "CU" }] }
        : {}),
      totalGrossWeight: { value: totalWeight, unit: "KGM" },
      parties: { consignor },
      goodsItem: [{
        packageTypeCode: "PC",
        items: Array.from({ length: parcels }, () => ({
          // Pickup-API wants only itemId (no itemIdType)
          itemIdentification: { itemId: "0" },
          grossWeight: { value: Number((totalWeight / parcels).toFixed(3)), unit: "KGM" },
        })),
      }],
    };

    const body: PostNordEdiBody = {
      messageDate: now.toISOString(),
      messageFunction: "PickupBooking",
      messageId,
      application: {
        applicationId: POSTNORD_APP_ID > 0 ? POSTNORD_APP_ID : 9999,
        name: POSTNORD_APP_NAME,
        version: POSTNORD_APP_VERSION,
      },
      updateIndicator: "Original",
      shipment: [shipment],
    };

    const pnUrl = `${postnordBase(env)}/rest/shipment/v3/pickups?apikey=${encodeURIComponent(apiKey)}`;
    const pnRes = await fetch(pnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const pnText = await pnRes.text();
    let pnJson: any = null;
    try { pnJson = JSON.parse(pnText); } catch { /* leave null */ }

    if (!pnRes.ok) {
      console.error("PostNord pickup booking failed", { status: pnRes.status, body: pnJson ?? pnText });
      const message = pnJson?.message
        ?? pnJson?.compositeFault?.faults?.[0]?.explanationText
        ?? `PostNord HTTP ${pnRes.status}`;
      await admin
        .from("pickup_bookings")
        .update({
          status: "failed",
          error: String(message).slice(0, 1000),
          postnord_request: body,
          postnord_response: pnJson ?? { raw: pnText.slice(0, 5000) },
        })
        .eq("id", bookingRow.id);
      return jsonResp({
        error: "postnord_failed",
        status: pnRes.status,
        body: pnJson,
        message,
      }, 400);
    }

    // Success — extract pickup_id and tracking_url
    const idsArr: any[] = pnJson?.idInformation ?? [];
    const pickupIdEntry = idsArr
      .flatMap((info: any) => info?.ids ?? [])
      .find((x: any) => x?.idType === "pickupId" || x?.idType === "PICKUP_ID");
    const pickupId: string | null = pickupIdEntry?.value ?? pnJson?.bookingId ?? null;
    const trackingUrl: string | null = idsArr
      .flatMap((info: any) => info?.urls ?? [])
      .find((u: any) => u?.type === "TRACKING")?.url ?? null;

    const { data: updated } = await admin
      .from("pickup_bookings")
      .update({
        status: "booked",
        pickup_id: pickupId,
        booking_id: pnJson?.bookingId ?? null,
        tracking_url: trackingUrl,
        postnord_request: body,
        postnord_response: pnJson,
      })
      .eq("id", bookingRow.id)
      .select()
      .single();

    // Link to shipment if applicable
    if (linkedShipment?.id) {
      await admin
        .from("shipments")
        .update({ pickup_booking_id: bookingRow.id })
        .eq("id", linkedShipment.id);
    }

    return jsonResp({ ok: true, pickup: updated ?? bookingRow });
  } catch (e: any) {
    console.error("book-pickup unhandled error", e);
    return jsonResp({ error: String(e?.message ?? e) }, 500);
  }
});
