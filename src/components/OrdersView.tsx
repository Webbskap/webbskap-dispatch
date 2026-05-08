import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tenant } from "@/hooks/useAuthAndTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { RefreshCw, Search, Package, Inbox, ExternalLink, FileText, Printer, Truck, MapPin } from "lucide-react";

const SERVICES: Array<{ code: string; name: string; domestic: boolean }> = [
  { code: "17", name: "MyPack Home (hemleverans)", domestic: true },
  { code: "19", name: "MyPack Collect (utlämningsställe)", domestic: true },
  { code: "18", name: "Parcel (företag)", domestic: true },
  { code: "1", name: "PostNord Parcel International", domestic: false },
];

const PRESET_SIZES: Array<{ name: string; l: number; w: number; h: number }> = [
  { name: "S — Litet kuvert", l: 25, w: 18, h: 3 },
  { name: "M — Standardkartong", l: 35, w: 25, h: 15 },
  { name: "L — Stor kartong", l: 60, w: 40, h: 30 },
];

type Order = any;
type Draft = any;
type Shipment = any;

type Filter = "all" | "unbooked" | "booked" | "shipped";

export function OrdersView({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [shipments, setShipments] = useState<Record<string, Shipment>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = async () => {
    setRefreshing(true);
    const [{ data: o }, { data: d }, { data: s }] = await Promise.all([
      supabase.from("orders").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("shipment_drafts").select("*").eq("tenant_id", tenant.id),
      supabase.from("shipments").select("*").eq("tenant_id", tenant.id),
    ]);
    setOrders(o ?? []);
    setDrafts(Object.fromEntries((d ?? []).map((r) => [r.order_id, r])));
    setShipments(Object.fromEntries((s ?? []).map((r) => [r.order_id, r])));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    refresh();
    const ch = supabase.channel(`tenant-${tenant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenant.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipment_drafts", filter: `tenant_id=eq.${tenant.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: `tenant_id=eq.${tenant.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [tenant.id]);

  const counts = useMemo(() => {
    let unbooked = 0, booked = 0, shipped = 0;
    for (const o of orders) {
      const sh = shipments[o.id];
      if (!sh) unbooked++;
      else if (sh.status === "delivered" || sh.status === "shipped") shipped++;
      else booked++;
    }
    return { all: orders.length, unbooked, booked, shipped };
  }, [orders, shipments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const sh = shipments[o.id];
      if (filter === "unbooked" && sh) return false;
      if (filter === "booked" && (!sh || sh.status === "delivered" || sh.status === "shipped")) return false;
      if (filter === "shipped" && (!sh || (sh.status !== "delivered" && sh.status !== "shipped"))) return false;
      if (!q) return true;
      const hay = `${o.invoice_no ?? ""} ${o.webbskap_order_id ?? ""} ${o.customer_name ?? ""} ${o.customer_email ?? ""} ${sh?.tracking_no ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, shipments, filter, search]);

  const sel = orders.find((o) => o.id === selected) ?? null;

  if (loading) return <div className="text-muted-foreground">Laddar ordrar…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök på order, kund, e-post eller tracking…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          <FilterChip active={filter === "all"} count={counts.all} onClick={() => setFilter("all")}>Alla</FilterChip>
          <FilterChip active={filter === "unbooked"} count={counts.unbooked} onClick={() => setFilter("unbooked")}>Att boka</FilterChip>
          <FilterChip active={filter === "booked"} count={counts.booked} onClick={() => setFilter("booked")}>Bokade</FilterChip>
          <FilterChip active={filter === "shipped"} count={counts.shipped} onClick={() => setFilter("shipped")}>Skickade</FilterChip>
        </div>
        <div className="flex items-center gap-2 text-xs">
        </div>
        <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing} aria-label="Uppdatera">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-4">
        <Card className="p-2 max-h-[75vh] overflow-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
              <Inbox className="h-8 w-8 mx-auto opacity-50" />
              {orders.length === 0
                ? <p>Inga ordrar än. När en kund handlar i Webbskap-sajten kommer ordern hit automatiskt.</p>
                : <p>Inga ordrar matchar filtret.</p>}
            </div>
          )}
          {filtered.map((o) => {
            const sh = shipments[o.id];
            return (
              <button
                key={o.id}
                onClick={() => setSelected(o.id)}
                className={`w-full text-left p-3 rounded hover:bg-muted ${selected === o.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">#{o.invoice_no ?? o.webbskap_order_id}</div>
                  {sh
                    ? <Badge variant="secondary">{sh.status}</Badge>
                    : <Badge>{o.status}</Badge>}
                </div>
                <div className="text-sm text-muted-foreground truncate">{o.customer_name}</div>
                <div className="text-xs text-muted-foreground">
                  {o.total} {o.currency ?? ""} · {o.weight ?? "?"} {o.weight_unit}
                </div>
              </button>
            );
          })}
        </Card>

        {sel ? (
          <OrderDetail
            order={sel}
            draft={drafts[sel.id]}
            shipment={shipments[sel.id]}
            onChanged={refresh}
          />
        ) : (
          <Card className="p-6 text-muted-foreground flex items-center justify-center min-h-[200px]">
            <div className="text-center space-y-1">
              <Package className="h-8 w-8 mx-auto opacity-50" />
              <p className="text-sm">Välj en order till vänster för att boka frakt.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-full transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {children} <span className="opacity-70">({count})</span>
    </button>
  );
}

function OrderDetail({ order, draft, shipment, onChanged }: any) {
  const [d, setD] = useState<any>(draft ?? {});
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => setD(draft ?? {}), [draft?.id]);

  const ship = order.shipping_address ?? {};
  const isInternational = ship.country && String(ship.country).toUpperCase() !== "SE";
  const serviceCode = d.service_code || "17";
  const serviceLabel = SERVICES.find((s) => s.code === serviceCode)?.name ?? serviceCode;
  const saveDraft = async () => {
    if (!d?.id) return;
    const { error } = await supabase.from("shipment_drafts").update({
      service_code: d.service_code, parcels: d.parcels ?? 1,
      weight_kg: d.weight_kg, length_cm: d.length_cm,
      width_cm: d.width_cm, height_cm: d.height_cm, notes: d.notes,
    }).eq("id", d.id);
    if (error) toast.error(error.message); else toast.success("Utkast sparat");
  };

  const book = async () => {
    if (!d?.weight_kg || d.weight_kg <= 0) {
      toast.error("Ange vikt innan du bokar");
      return;
    }
    setConfirmOpen(false);
    setBusy(true);
    await saveDraft();
    const { data, error } = await supabase.functions.invoke("book-shipment", { body: { draft_id: d.id } });
    setBusy(false);
    const errBody = data as any;
    if (error || errBody?.error) {
      const msg = errBody?.message ?? errBody?.details ?? errBody?.error ?? error?.message ?? "Bokning misslyckades";
      toast.error(msg);
    } else {
      toast.success("Bokat hos PostNord!");
      onChanged();
    }
  };

  const downloadLabel = async () => {
    const { data, error } = await supabase.functions.invoke("label-url", { body: { shipment_id: shipment.id } });
    if (error || !(data as any)?.url) toast.error("Kunde inte hämta etikett");
    else window.open((data as any).url, "_blank");
  };

  const refreshTracking = async () => {
    setTracking(true);
    const { error } = await supabase.functions.invoke("track-shipment", { body: { shipment_id: shipment.id } });
    setTracking(false);
    if (error) toast.error("Kunde inte hämta status");
    else { toast.success("Status uppdaterad"); onChanged(); }
  };

  const printPackingSlip = () => {
    const items = (order.items ?? []) as any[];
    const e = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Följesedel ${e(order.invoice_no ?? "")}</title>
    <style>body{font-family:system-ui;padding:24px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}</style></head><body>
    <h1>Följesedel</h1>
    <div>Order #${e(order.invoice_no ?? order.webbskap_order_id)}</div>
    <h3 style="margin-top:24px">Levereras till</h3>
    <div>${e(ship.name ?? order.customer_name ?? "")}<br>${e(ship.address ?? "")}<br>${e(ship.zipCode ?? "")} ${e(ship.city ?? "")}<br>${e(ship.country ?? "")}</div>
    <table><thead><tr><th>Produkt</th><th>SKU</th><th>Antal</th></tr></thead><tbody>
    ${items.map((i) => `<tr><td>${e(i.name ?? "")}</td><td>${e(i.sku ?? "")}</td><td>${e(i.quantity ?? "")}</td></tr>`).join("")}
    </tbody></table>
    <script>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    w?.document.write(html); w?.document.close();
  };

  const trackingUrl = shipment?.tracking_no
    ? `https://tracking.postnord.com/se/?id=${shipment.tracking_no}`
    : null;

  const events: Array<{ status: string; description?: string; location?: string; at: string }> =
    Array.isArray(shipment?.status_history) ? shipment.status_history : [];

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xl font-semibold truncate">#{order.invoice_no ?? order.webbskap_order_id}</div>
          <div className="text-sm text-muted-foreground truncate">{order.customer_name} · {order.customer_email}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={printPackingSlip}>
            <FileText className="h-4 w-4 mr-1.5" />Följesedel
          </Button>
          {shipment ? (
            <Button onClick={downloadLabel}>
              <Printer className="h-4 w-4 mr-1.5" />Ladda ner fraktsedel
            </Button>
          ) : (
            <Button onClick={() => setConfirmOpen(true)} disabled={busy}>
              {busy ? "Bokar…" : "Boka & skriv fraktsedel"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <section>
          <h3 className="text-sm font-medium mb-2">Mottagare</h3>
          <div className="text-sm">
            {ship.name ?? order.customer_name}<br />
            {ship.address}{ship.address2 ? <><br />{ship.address2}</> : null}<br />
            {ship.zipCode} {ship.city}<br />
            {ship.country}{ship.phone ? ` · ${ship.phone}` : ""}
          </div>
          {isInternational && (
            <Badge variant="outline" className="mt-2">
              Utland — kontrollera tulldokument (CN22/CN23) innan bokning
            </Badge>
          )}
        </section>
        <section>
          <h3 className="text-sm font-medium mb-2">Innehåll</h3>
          <ul className="text-sm space-y-1">
            {(order.items ?? []).map((i: any, idx: number) => (
              <li key={idx}>{i.quantity}× {i.name} {i.sku ? <span className="text-muted-foreground">({i.sku})</span> : null}</li>
            ))}
          </ul>
        </section>
      </div>

      {!shipment && d?.id && (
        <section className="space-y-3 pt-4 border-t">
          <h3 className="text-sm font-medium">Fraktdetaljer</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Tjänst</Label>
              <Select value={serviceCode} onValueChange={(v) => setD({ ...d, service_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICES.filter((s) => isInternational ? !s.domestic : s.domestic).map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Förinställd storlek</Label>
              <Select
                value=""
                onValueChange={(v) => {
                  const p = PRESET_SIZES.find((p) => p.name === v);
                  if (p) setD({ ...d, length_cm: p.l, width_cm: p.w, height_cm: p.h });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Välj S / M / L eller fyll i manuellt nedan…" /></SelectTrigger>
                <SelectContent>
                  {PRESET_SIZES.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name} — {p.l}×{p.w}×{p.h} cm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Antal kolli</Label>
              <Input type="number" value={d.parcels ?? 1} onChange={(e) => setD({ ...d, parcels: +e.target.value })} /></div>
            <div><Label>Vikt (kg)</Label>
              <Input type="number" step="0.01" value={d.weight_kg ?? ""} onChange={(e) => setD({ ...d, weight_kg: +e.target.value })} /></div>
            <div><Label>Längd (cm)</Label>
              <Input type="number" value={d.length_cm ?? ""} onChange={(e) => setD({ ...d, length_cm: +e.target.value })} /></div>
            <div><Label>Bredd (cm)</Label>
              <Input type="number" value={d.width_cm ?? ""} onChange={(e) => setD({ ...d, width_cm: +e.target.value })} /></div>
            <div><Label>Höjd (cm)</Label>
              <Input type="number" value={d.height_cm ?? ""} onChange={(e) => setD({ ...d, height_cm: +e.target.value })} /></div>
            <div className="sm:col-span-2">
              <Label>Anteckning</Label>
              <Input value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={saveDraft}>Spara utkast</Button>
        </section>
      )}

      {shipment && (
        <section className="pt-4 border-t space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm">
                <span className="text-muted-foreground">Tracking:</span>{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded">{shipment.tracking_no ?? "—"}</code>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Bokad: {new Date(shipment.booked_at).toLocaleString("sv-SE")}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={refreshTracking} disabled={tracking}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${tracking ? "animate-spin" : ""}`} />
                Uppdatera status
              </Button>
              {trackingUrl && (
                <a href={trackingUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    Öppna hos PostNord <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </a>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4" /> Status
              <Badge variant="secondary" className="ml-1">{shipment.status}</Badge>
            </h3>
            {events.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Inga spårningshändelser än. Klicka "Uppdatera status" för att hämta från PostNord.
              </div>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-4">
                {[...events].reverse().map((ev, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <li key={idx} className="ml-4">
                      <span className={`absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full ${isLatest ? "bg-primary ring-4 ring-primary/20" : "bg-muted-foreground/40"}`} />
                      <div className="text-sm font-medium">{ev.status}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        {ev.location && <><MapPin className="h-3 w-3" />{ev.location} ·</>}
                        {ev.at ? new Date(ev.at).toLocaleString("sv-SE") : null}
                      </div>
                      {ev.description && <div className="text-xs mt-0.5">{ev.description}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekräfta bokning hos PostNord</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <div className="text-sm">Du är på väg att boka en sändning hos PostNord. Detta kan inte ångras.</div>
                <div className="bg-muted rounded p-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">Order:</span> #{order.invoice_no ?? order.webbskap_order_id} · {order.customer_name}</div>
                  <div><span className="text-muted-foreground">Till:</span> {ship.zipCode} {ship.city}, {ship.country}</div>
                  <div><span className="text-muted-foreground">Tjänst:</span> {serviceCode} — {serviceLabel}</div>
                  <div><span className="text-muted-foreground">Kolli:</span> {d.parcels ?? 1} st · {d.weight_kg ?? "?"} kg</div>
                  {d.length_cm && <div><span className="text-muted-foreground">Mått:</span> {d.length_cm}×{d.width_cm}×{d.height_cm} cm</div>}
                </div>
                <div className="text-xs text-muted-foreground">Status och spårningsnummer skickas tillbaka till ordern i Webbskap automatiskt.</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={book}>Boka nu</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
