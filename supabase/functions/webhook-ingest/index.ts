// Webbskap site webhook ingest
// URL pattern: POST /webhook-ingest/<tenant_id>
// Verifies X-Webhook-Signature (HMAC-SHA512 hex digest of raw body using tenant webhook_secret)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_STATUSES = ["pending", "shipped", "completed", "canceled", "archived"] as const;
type OrderStatus = typeof VALID_STATUSES[number];

async function hmacSha512Hex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function blank<T>(v: T | "" | null | undefined): T | null {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v as T;
}

function normaliseAddress(addr: any): any {
  if (!addr || typeof addr !== "object") return null;
  const out: any = {};
  for (const [k, v] of Object.entries(addr)) {
    out[k] = typeof v === "string" ? blank(v) : v;
  }
  return out;
}

function normaliseStatus(raw: unknown): OrderStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  return (VALID_STATUSES as readonly string[]).includes(s) ? (s as OrderStatus) : "pending";
}

function normaliseWeight(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const tenantId = parts[parts.length - 1];

  const topic = req.headers.get("X-Webhook-Topic") ?? "unknown";
  const sig = req.headers.get("X-Webhook-Signature") ?? "";
  const raw = await req.text();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { /* keep null */ }

  const { data: cfg } = await admin
    .from("tenant_webbskap_config")
    .select("webhook_secret")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let verified = false;
  if (cfg?.webhook_secret) {
    const expected = await hmacSha512Hex(cfg.webhook_secret, raw);
    verified = timingSafeEq(expected, sig.toLowerCase());
  }

  const { data: logged } = await admin
    .from("webhook_events")
    .insert({
      tenant_id: tenantId,
      source: "webbskap_site",
      topic,
      payload,
      signature: sig,
      verified,
      processed: false,
    })
    .select("id")
    .single();
  const eventId = logged?.id;

  if (!verified) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (topic === "order_created" || topic === "order_updated") {
      const o = payload ?? {};
      const order = (o.id ?? o.invoiceNo) ? o : (o.order ?? o.data ?? o);

      if (!order || (!order.id && !order.invoiceNo)) {
        if (eventId) await admin.from("webhook_events").update({ error: "no_order_id_in_payload" }).eq("id", eventId);
        return new Response(JSON.stringify({ error: "no_order_id_in_payload" }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }

      await admin.from("orders").upsert(
        {
          tenant_id: tenantId,
          webbskap_order_id: String(order.id ?? order.invoiceNo),
          invoice_no: order.invoiceNo != null ? String(order.invoiceNo) : null,
          customer_name: blank(order.customerName),
          customer_email: blank(order.customerEmail),
          shipping_address: normaliseAddress(order.shippingAddress),
          billing_address: normaliseAddress(order.billingAddress),
          items: Array.isArray(order.items) ? order.items : [],
          weight: normaliseWeight(order.weight),
          weight_unit: blank(order.weightUnit) ?? "kg",
          sub_total: order.subTotal ?? null,
          total: order.total ?? null,
          currency: blank(order.currency),
          shipping_name: blank(order.shippingName),
          shipping_amount: order.shippingAmount ?? null,
          paid: !!order.paid,
          status: normaliseStatus(order.status),
          requires_shipping: order.shippingRequired !== false,
          raw: order,
          webbskap_created_at: order.created ? new Date(order.created * 1000).toISOString() : null,
        },
        { onConflict: "tenant_id,webbskap_order_id" },
      );
    }

    if (eventId) {
      await admin.from("webhook_events").update({ processed: true }).eq("id", eventId);
    }
  } catch (e: any) {
    console.error("processing error", e);
    if (eventId) {
      await admin.from("webhook_events").update({ error: String(e?.message ?? e) }).eq("id", eventId);
    }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
