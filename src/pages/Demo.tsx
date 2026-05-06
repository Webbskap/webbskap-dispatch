import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package, Settings, CheckCircle2, Truck, MapPin, Inbox, RefreshCw,
  Undo2, CalendarClock, BarChart3, FileText, Printer, Search, AlertCircle, Loader2, Sparkles,
} from "lucide-react";

// Standalone demo — hardcoded data, no backend, no Webbskap.

type TrackEvent = { at: string; status: string; location?: string; description: string };

type DemoOrder = {
  id: string;
  invoice_no: string;
  customer_name: string;
  customer_email: string;
  total: number;
  currency: string;
  weight: number;
  status: "pending" | "shipped" | "delivered";
  shipping_address: {
    name: string; address: string; address2?: string;
    zipCode: string; city: string; country: string; phone: string;
  };
  items: { name: string; sku: string; quantity: number }[];
  draft: { service_code: string; parcels: number; weight_kg: number; length_cm?: number; width_cm?: number; height_cm?: number; notes?: string };
  shipment?: { tracking_no: string; status: "booked" | "in_transit" | "delivered"; booked_at: string; events: TrackEvent[]; return_tracking_no?: string };
};

// Förinställda paketstorlekar – matchar inställningarna under "Standardpaket"
const PRESET_SIZES = [
  { name: "Litet (S)",  l: 25, w: 20, h: 5 },
  { name: "Medium (M)", l: 35, w: 25, h: 15 },
  { name: "Stort (L)",  l: 50, w: 35, h: 25 },
];

// PostNord-tjänster (vanligaste – fyll på vid behov)
const SERVICES = [
  { code: "17",   name: "MyPack Collect (utlämningsställe)", domestic: true },
  { code: "19",   name: "MyPack Home (hemleverans)",         domestic: true },
  { code: "1",    name: "DPD Företagspaket",                 domestic: true },
  { code: "2",    name: "PostNord Parcel (företag)",         domestic: true },
  { code: "52",   name: "Värdepaket",                        domestic: true },
  { code: "25",   name: "MyPack Collect Utland",             domestic: false },
  { code: "37",   name: "Varubrev Utland",                   domestic: false },
];

const SAMPLE: DemoOrder[] = [
  {
    id: "1", invoice_no: "1042",
    customer_name: "Anna Andersson", customer_email: "anna@example.se",
    total: 599, currency: "SEK", weight: 1.2, status: "pending",
    shipping_address: { name: "Anna Andersson", address: "Storgatan 12", zipCode: "11122", city: "Stockholm", country: "SE", phone: "+46701234567" },
    items: [{ name: "Ekologisk t-shirt", sku: "TS-ECO-M", quantity: 2 }, { name: "Tygkasse", sku: "BAG-01", quantity: 1 }],
    draft: { service_code: "17", parcels: 1, weight_kg: 1.2, length_cm: 30, width_cm: 20, height_cm: 10 },
  },
  {
    id: "2", invoice_no: "1041",
    customer_name: "Erik Eriksson", customer_email: "erik@example.se",
    total: 1299, currency: "SEK", weight: 3.5, status: "shipped",
    shipping_address: { name: "Erik Eriksson", address: "Vasagatan 3", zipCode: "41118", city: "Göteborg", country: "SE", phone: "+46709876543" },
    items: [{ name: "Yogamatta", sku: "YM-PRO", quantity: 1 }],
    draft: { service_code: "17", parcels: 1, weight_kg: 3.5 },
    shipment: {
      tracking_no: "JJFI00000000012345", status: "in_transit",
      booked_at: new Date(Date.now() - 86400000).toISOString(),
      events: [
        { at: new Date(Date.now() - 86400000).toISOString(), status: "Bokad", location: "Stockholm", description: "Sändning skapad i PostNords system" },
        { at: new Date(Date.now() - 60000000).toISOString(), status: "Inlämnad", location: "Stockholm Terminal", description: "Mottagen på terminalen" },
        { at: new Date(Date.now() - 20000000).toISOString(), status: "Under transport", location: "Göteborg Terminal", description: "Anlänt till utlämningsterminal" },
      ],
    },
  },
  {
    id: "3", invoice_no: "1040",
    customer_name: "Maja Lindberg", customer_email: "maja@example.se",
    total: 249, currency: "SEK", weight: 0.4, status: "delivered",
    shipping_address: { name: "Maja Lindberg", address: "Kungsgatan 45", address2: "Lgh 1203", zipCode: "21145", city: "Malmö", country: "SE", phone: "+46703334455" },
    items: [{ name: "Doftljus", sku: "CDL-VAN", quantity: 3 }],
    draft: { service_code: "17", parcels: 1, weight_kg: 0.4 },
    shipment: {
      tracking_no: "JJFI00000000067890", status: "delivered",
      booked_at: new Date(Date.now() - 86400000 * 4).toISOString(),
      events: [
        { at: new Date(Date.now() - 86400000 * 4).toISOString(), status: "Bokad", location: "Stockholm", description: "Sändning skapad" },
        { at: new Date(Date.now() - 86400000 * 3).toISOString(), status: "Under transport", location: "Malmö", description: "Ute för leverans" },
        { at: new Date(Date.now() - 86400000 * 2).toISOString(), status: "Levererad", location: "Malmö", description: "Utlämnad till mottagare" },
      ],
    },
  },
];

type View = "orders" | "pickups" | "stats" | "settings";

export default function Demo() {
  const [view, setView] = useState<View>("orders");
  const [orders, setOrders] = useState(SAMPLE);
  const [selected, setSelected] = useState<string | null>(SAMPLE[0].id);
  const [orderTab, setOrderTab] = useState<"active" | "done">("active");
  const [defaultService, setDefaultService] = useState("17");
  const [labelFormat, setLabelFormat] = useState<"pdf-a4" | "pdf-a5" | "pdf-a6" | "zpl">("pdf-a4");
  const [search, setSearch] = useState("");

  const sel = useMemo(() => orders.find((o) => o.id === selected) ?? null, [orders, selected]);
  const active = orders.filter((o) => o.shipment?.status !== "delivered");
  const done = orders.filter((o) => o.shipment?.status === "delivered");
  const base = orderTab === "active" ? active : done;
  const q = search.trim().toLowerCase();
  const visible = q
    ? base.filter((o) =>
        o.invoice_no.includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_email.toLowerCase().includes(q) ||
        o.shipment?.tracking_no?.toLowerCase().includes(q),
      )
    : base;

  const handleBook = (id: string) => {
    setOrders((prev) => prev.map((p) => p.id === id ? {
      ...p, status: "shipped",
      shipment: {
        tracking_no: "JJFI00000000099999", status: "booked",
        booked_at: new Date().toISOString(),
        events: [{ at: new Date().toISOString(), status: "Bokad", location: "Stockholm", description: "Sändning skapad i PostNords system" }],
      },
    } : p));
  };

  const handleReturn = (id: string) => {
    setOrders((prev) => prev.map((p) => p.id === id && p.shipment ? {
      ...p, shipment: { ...p.shipment, return_tracking_no: "RJJFI00000000054321" },
    } : p));
    alert("Demo: retursedel skapad och e-postad till kunden.");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-amber-100 dark:bg-amber-900/30 border-b border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs px-4 py-2 text-center">
        🔒 Förhandsvisning (demo) — endast för dig. Ingen riktig data, inget skickas till PostNord eller Webbskap.
      </div>

      {/* Top nav */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-semibold text-sm">PostNord-portal</div>
            <span className="text-xs text-muted-foreground hidden sm:inline truncate">demo.webbskap.se</span>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto">
            <NavBtn active={view === "orders"} onClick={() => setView("orders")} icon={<Package className="h-4 w-4" />} label="Ordrar" badge={active.length} />
            <NavBtn active={view === "pickups"} onClick={() => setView("pickups")} icon={<CalendarClock className="h-4 w-4" />} label="Upphämtning" />
            <NavBtn active={view === "stats"} onClick={() => setView("stats")} icon={<BarChart3 className="h-4 w-4" />} label="Statistik" />
            <NavBtn active={view === "settings"} onClick={() => setView("settings")} icon={<Settings className="h-4 w-4" />} label="Inställningar" />
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {view === "orders" && (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <Tabs value={orderTab} onValueChange={(v) => setOrderTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="active" className="gap-2">
                    <Inbox className="h-4 w-4" /> Aktiva <Badge variant="secondary" className="ml-1">{active.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="done" className="gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Klara <Badge variant="secondary" className="ml-1">{done.length}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Etikett:</span>
                <Select value={labelFormat} onValueChange={(v) => setLabelFormat(v as any)}>
                  <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf-a4">PDF — A4</SelectItem>
                    <SelectItem value="pdf-a5">PDF — A5</SelectItem>
                    <SelectItem value="pdf-a6">PDF — A6 (4×6")</SelectItem>
                    <SelectItem value="zpl">ZPL — Zebra 8dpmm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid lg:grid-cols-[340px_1fr] gap-4">
              <Card className="p-2 max-h-[75vh] overflow-auto">
                {visible.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {orderTab === "active" ? "Inga aktiva ordrar." : "Inga klara ordrar än."}
                  </div>
                )}
                {visible.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSelected(o.id)}
                    className={`w-full text-left p-3 rounded hover:bg-muted ${selected === o.id ? "bg-muted" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">#{o.invoice_no}</div>
                      <StatusBadge order={o} />
                    </div>
                    <div className="text-sm text-muted-foreground truncate">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{o.total} {o.currency} · {o.weight} kg</div>
                  </button>
                ))}
              </Card>

              {sel && visible.includes(sel)
                ? <DemoDetail order={sel} labelFormat={labelFormat} defaultService={defaultService}
                    onBook={() => handleBook(sel.id)} onReturn={() => handleReturn(sel.id)} />
                : <Card className="p-6 text-muted-foreground">Välj en order till vänster.</Card>}
            </div>
          </>
        )}

        {view === "pickups" && <PickupView />}
        {view === "stats" && <StatsView orders={orders} />}
        {view === "settings" && <DemoSettings defaultService={defaultService} setDefaultService={setDefaultService} />}
      </main>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition whitespace-nowrap ${active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"}`}
    >
      {icon}<span className="hidden sm:inline">{label}</span>
      {badge !== undefined && badge > 0 && <Badge variant="secondary" className="ml-0.5 h-5">{badge}</Badge>}
    </button>
  );
}

function StatusBadge({ order }: { order: DemoOrder }) {
  const sh = order.shipment;
  if (!sh) return <Badge>Ny</Badge>;
  if (sh.status === "delivered") return <Badge variant="secondary" className="bg-green-100 text-green-900 hover:bg-green-100">Levererad</Badge>;
  if (sh.status === "in_transit") return <Badge variant="secondary" className="bg-blue-100 text-blue-900 hover:bg-blue-100">På väg</Badge>;
  return <Badge variant="secondary">Bokad</Badge>;
}

function DemoDetail({ order, labelFormat, defaultService, onBook, onReturn }:
  { order: DemoOrder; labelFormat: string; defaultService: string; onBook: () => void; onReturn: () => void }) {
  const [d, setD] = useState({ ...order.draft, service_code: order.draft.service_code || defaultService });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ship = order.shipping_address;
  const isInternational = ship.country !== "SE";
  const serviceLabel = SERVICES.find((s) => s.code === d.service_code)?.name ?? d.service_code;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xl font-semibold">#{order.invoice_no}</div>
          <div className="text-sm text-muted-foreground">{order.customer_name} · {order.customer_email}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => alert("Demo: skulle skriva ut följesedel")}>
            <FileText className="h-4 w-4 mr-1.5" />Följesedel
          </Button>
          {order.shipment ? (
            <>
              <Button variant="outline" onClick={() => alert(`Demo: laddar ner fraktsedel som ${labelFormat.toUpperCase()}`)}>
                <Printer className="h-4 w-4 mr-1.5" />Fraktsedel ({labelFormat.toUpperCase()})
              </Button>
              {!order.shipment.return_tracking_no && (
                <Button variant="outline" onClick={onReturn}>
                  <Undo2 className="h-4 w-4 mr-1.5" />Skapa retursedel
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => setConfirmOpen(true)}>Boka & skriv fraktsedel</Button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <section>
          <h3 className="text-sm font-medium mb-2">Mottagare</h3>
          <div className="text-sm">
            {ship.name}<br />{ship.address}<br />{ship.address2}<br />
            {ship.zipCode} {ship.city}<br />{ship.country} · {ship.phone}
          </div>
          {isInternational && <Badge variant="outline" className="mt-2">Utland — tulldokument (CN22/CN23) genereras automatiskt</Badge>}
        </section>
        <section>
          <h3 className="text-sm font-medium mb-2">Innehåll</h3>
          <ul className="text-sm space-y-1">
            {order.items.map((i, idx) => (
              <li key={idx}>{i.quantity}× {i.name} <span className="text-muted-foreground">({i.sku})</span></li>
            ))}
          </ul>
        </section>
      </div>

      {!order.shipment && (
        <section className="space-y-3 pt-4 border-t">
          <h3 className="text-sm font-medium">Fraktdetaljer</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Tjänst</Label>
              <Select value={d.service_code} onValueChange={(v) => setD({ ...d, service_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICES.filter((s) => isInternational ? !s.domestic : s.domestic).map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground mt-1">Standardtjänst: <code>{defaultService}</code> (ändras i Inställningar)</div>
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
                <SelectTrigger><SelectValue placeholder="Välj storlek (S / M / L / egna)…" /></SelectTrigger>
                <SelectContent>
                  {PRESET_SIZES.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name} — {p.l}×{p.w}×{p.h} cm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground mt-1">Hanteras under <em>Inställningar → Standardpaket</em>.</div>
            </div>
            <div><Label>Antal kolli</Label><Input type="number" value={d.parcels} onChange={(e) => setD({ ...d, parcels: +e.target.value })} /></div>
            <div><Label>Vikt (kg)</Label><Input type="number" step="0.01" value={d.weight_kg} onChange={(e) => setD({ ...d, weight_kg: +e.target.value })} /></div>
            <div><Label>Längd (cm)</Label><Input type="number" value={d.length_cm ?? ""} onChange={(e) => setD({ ...d, length_cm: +e.target.value })} /></div>
            <div><Label>Bredd (cm)</Label><Input type="number" value={d.width_cm ?? ""} onChange={(e) => setD({ ...d, width_cm: +e.target.value })} /></div>
            <div><Label>Höjd (cm)</Label><Input type="number" value={d.height_cm ?? ""} onChange={(e) => setD({ ...d, height_cm: +e.target.value })} /></div>
          </div>
          <div className="text-xs text-muted-foreground">
            Beräknat pris: <strong>~{Math.round(75 + d.weight_kg * 12)} kr</strong> · Levereras typiskt om 1–2 arbetsdagar
          </div>
        </section>
      )}

      {order.shipment && (
        <section className="pt-4 border-t space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm"><span className="text-muted-foreground">Tracking:</span> <code className="bg-muted px-1.5 py-0.5 rounded">{order.shipment.tracking_no}</code></div>
              <div className="text-xs text-muted-foreground mt-1">Tjänst: {serviceLabel} · Bokad: {new Date(order.shipment.booked_at).toLocaleString("sv-SE")}</div>
              {order.shipment.return_tracking_no && (
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">Retur:</span>{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded">{order.shipment.return_tracking_no}</code>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => alert("Demo: hämtar senaste status från PostNord")}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Uppdatera
              </Button>
              <a href={`https://tracking.postnord.com/se/?id=${order.shipment.tracking_no}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">Öppna hos PostNord</Button>
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Truck className="h-4 w-4" /> Live-spårning</h3>
            <ol className="relative border-l border-border ml-2 space-y-4">
              {[...order.shipment.events].reverse().map((ev, idx) => {
                const isLatest = idx === 0;
                return (
                  <li key={idx} className="ml-4">
                    <span className={`absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full ${isLatest ? "bg-primary ring-4 ring-primary/20" : "bg-muted-foreground/40"}`} />
                    <div className="text-sm font-medium">{ev.status}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {ev.location && <><MapPin className="h-3 w-3" />{ev.location} ·</>}
                      {new Date(ev.at).toLocaleString("sv-SE")}
                    </div>
                    <div className="text-xs mt-0.5">{ev.description}</div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekräfta bokning hos PostNord</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <div className="text-sm">Du är på väg att boka en sändning. Detta kan inte ångras.</div>
                <div className="bg-muted rounded p-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">Order:</span> #{order.invoice_no} · {order.customer_name}</div>
                  <div><span className="text-muted-foreground">Till:</span> {ship.zipCode} {ship.city}, {ship.country}</div>
                  <div><span className="text-muted-foreground">Tjänst:</span> {d.service_code} — {serviceLabel}</div>
                  <div><span className="text-muted-foreground">Kolli:</span> {d.parcels} st · {d.weight_kg} kg</div>
                  {d.length_cm && <div><span className="text-muted-foreground">Mått:</span> {d.length_cm}×{d.width_cm}×{d.height_cm} cm</div>}
                  <div><span className="text-muted-foreground">Etikett:</span> {labelFormat.toUpperCase()}</div>
                </div>
                <div className="text-xs text-muted-foreground">Status och spårningsnummer skickas automatiskt tillbaka till ordern i Webbskap (Webbskap mailar kunden).</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={onBook}>Boka nu</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function PickupView() {
  const tomorrow = new Date(Date.now() + 86400000);
  const [date, setDate] = useState(tomorrow.toISOString().slice(0, 10));
  const [time, setTime] = useState("15:00");
  const [parcels, setParcels] = useState(5);
  const [weight, setWeight] = useState(15);

  // PostNords upphämtningsschema (förenklat – mån–fre dagtid, lör begränsat, sön stängt)
  const dow = new Date(date).getDay(); // 0=sön, 6=lör
  const schedule: Record<number, { open: boolean; from?: string; to?: string; label: string }> = {
    0: { open: false, label: "Söndag — ingen upphämtning" },
    1: { open: true, from: "08:00", to: "17:00", label: "Måndag 08–17" },
    2: { open: true, from: "08:00", to: "17:00", label: "Tisdag 08–17" },
    3: { open: true, from: "08:00", to: "17:00", label: "Onsdag 08–17" },
    4: { open: true, from: "08:00", to: "17:00", label: "Torsdag 08–17" },
    5: { open: true, from: "08:00", to: "17:00", label: "Fredag 08–17" },
    6: { open: true, from: "09:00", to: "13:00", label: "Lördag 09–13 (begränsat)" },
  };
  const day = schedule[dow];
  const inWindow = day.open && day.from! <= time && time <= day.to!;

  // Generera valbara halvtimmar inom dagens fönster
  const slots: string[] = [];
  if (day.open) {
    const [fh, fm] = day.from!.split(":").map(Number);
    const [th, tm] = day.to!.split(":").map(Number);
    for (let m = fh * 60 + fm; m <= th * 60 + tm; m += 30) {
      slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 max-w-4xl">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Boka upphämtning</h2>
        </div>
        <p className="text-sm text-muted-foreground">PostNord hämtar paketen direkt hos dig. Använder <code>/v3/pickups</code>.</p>
        <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Upphämtningsadress:</strong> hämtas automatiskt från avsändaradressen under <em>Inställningar → PostNord-uppgifter</em>.
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Datum</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Tid (senast klart)</Label>
            <Select value={time} onValueChange={setTime} disabled={!day.open}>
              <SelectTrigger><SelectValue placeholder="Välj tid" /></SelectTrigger>
              <SelectContent>
                {slots.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Antal kolli</Label><Input type="number" value={parcels} onChange={(e) => setParcels(+e.target.value)} /></div>
          <div><Label>Total vikt (kg)</Label><Input type="number" value={weight} onChange={(e) => setWeight(+e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Plats / instruktion</Label><Input placeholder="Lastkaj, baksidan av byggnaden…" /></div>
        </div>
        <div className={`text-xs rounded p-2 ${day.open ? "bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-100" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"}`}>
          PostNords schema valt datum: <strong>{day.label}</strong>
          {day.open && !inWindow && " — vald tid ligger utanför fönstret."}
        </div>
        <Button
          disabled={!day.open || !inWindow}
          onClick={() => alert("Demo: bokar upphämtning hos PostNord (/v3/pickups).")}
        >
          Boka upphämtning
        </Button>
      </Card>
      <Card className="p-6 space-y-3">
        <h3 className="text-sm font-medium">PostNords upphämtningsfönster</h3>
        <ul className="text-xs space-y-1 text-muted-foreground">
          <li>Mån–Fre: 08:00–17:00</li>
          <li>Lördag: 09:00–13:00 (begränsat)</li>
          <li>Söndag &amp; röda dagar: stängt</li>
        </ul>
        <div className="text-xs text-muted-foreground border-t pt-2">Faktiska tider kan variera per postnummer — bekräftas av PostNord vid bokning.</div>
        <h3 className="text-sm font-medium pt-2">Senaste upphämtningar</h3>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>• 2026-05-05 — 7 kolli ✅</li>
          <li>• 2026-05-04 — 4 kolli ✅</li>
          <li>• 2026-05-03 — 9 kolli ✅</li>
        </ul>
      </Card>
    </div>
  );
}

function StatsView({ orders }: { orders: DemoOrder[] }) {
  const total = orders.length;
  const shipped = orders.filter((o) => o.shipment).length;
  const delivered = orders.filter((o) => o.shipment?.status === "delivered").length;
  const totalKg = orders.reduce((s, o) => s + o.weight, 0).toFixed(1);
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Ordrar" value={total} />
        <Stat label="Bokade" value={shipped} />
        <Stat label="Levererade" value={delivered} />
        <Stat label="Total vikt" value={`${totalKg} kg`} />
      </div>
      <Card className="p-6">
        <h3 className="text-sm font-medium mb-2">Mest använda tjänster</h3>
        <div className="space-y-2 text-sm">
          <Bar label="MyPack Collect (17)" pct={70} />
          <Bar label="MyPack Home (19)" pct={20} />
          <Bar label="DPD Företagspaket (1)" pct={10} />
        </div>
      </Card>
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium">Fraktrapporter per månad</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            En ny rapport skapas automatiskt vid månadsskiftet med alla bokade sändningar för månaden. Priserna hämtas direkt från PostNord på varje bokning, så summorna stämmer mot fakturan och kan användas direkt i bokföringen (moms separeras per rad).
          </p>
        </div>
        <div className="border-t pt-3 space-y-2">
          {[
            { month: "April 2026",  count: 142, total: "13 624 kr", ready: true },
            { month: "Mars 2026",   count: 128, total: "11 980 kr", ready: true },
            { month: "Februari 2026", count: 99, total: "9 312 kr",  ready: true },
            { month: "Maj 2026",    count: 38,  total: "3 410 kr",  ready: false },
          ].map((r) => (
            <div key={r.month} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
              <div>
                <div className="text-sm font-medium">{r.month}</div>
                <div className="text-xs text-muted-foreground">{r.count} sändningar · {r.total}</div>
              </div>
              {r.ready ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => alert(`Demo: laddar ner ${r.month} som PDF`)}>
                    <FileText className="h-4 w-4 mr-1.5" /> PDF
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => alert(`Demo: laddar ner ${r.month} som CSV`)}>CSV</Button>
                </div>
              ) : (
                <Badge variant="secondary" className="text-xs">Pågår — färdig 1 juni</Badge>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: any) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}
function Bar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span>{label}</span><span>{pct}%</span></div>
      <div className="h-2 bg-muted rounded mt-1"><div className="h-full bg-primary rounded" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function DemoSettings({ defaultService, setDefaultService }: { defaultService: string; setDefaultService: (v: string) => void }) {
  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">1. Webbskap-koppling</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-green-100 text-green-900 hover:bg-green-100">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Ansluten
          </Badge>
          <span className="text-sm text-muted-foreground">demo.webbskap.se</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Kopplingen sker automatiskt när du öppnar fliken från Webbskap. Ordrar, kundinformation
          och statusuppdateringar synkas i bakgrunden — du behöver inte göra något här.
        </p>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">2. PostNord-uppgifter</h2>
        <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Partner-integration:</strong> Du behöver bara fylla i ditt PostNord-kundnummer.
          API-nyckeln hanteras av oss centralt — ingen egen nyckel behövs.
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Miljö</Label>
            <Select defaultValue="sandbox">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                <SelectItem value="live">Live (skarp bokning)</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground mt-1">Börja i Sandbox tills allt fungerar.</div>
          </div>
          <div><Label>Kundnummer hos PostNord</Label><Input placeholder="1234567" /></div>
          <div className="sm:col-span-2">
            <Label>Standardtjänst</Label>
            <Select value={defaultService} onValueChange={setDefaultService}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground mt-1">Används som förvalt på alla nya ordrar.</div>
          </div>
        </div>
        <h3 className="text-sm font-medium mt-2">Avsändare</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Företag</Label><Input defaultValue="Demo Butik AB" /></div>
          <div><Label>Kontaktperson</Label><Input defaultValue="Anna Säljare" /></div>
          <div className="sm:col-span-2"><Label>Adress</Label><Input defaultValue="Lagervägen 5" /></div>
          <div><Label>Postnummer</Label><Input defaultValue="12345" /></div>
          <div><Label>Ort</Label><Input defaultValue="Stockholm" /></div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">3. Etikett & utskrift</h2>
        <div className="space-y-3">
          <Row label="Standardstorlek på fraktsedel" sub="Du kan alltid välja annan storlek per order">
            <Select defaultValue="pdf-a4">
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf-a4">PDF — A4</SelectItem>
                <SelectItem value="pdf-a5">PDF — A5</SelectItem>
                <SelectItem value="pdf-a6">PDF — A6 (4×6")</SelectItem>
                <SelectItem value="zpl">ZPL — Zebra 8dpmm</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <div className="text-xs text-muted-foreground border-t pt-3">
            Följesedel skrivs ut separat från orderkortet. Spårningsmail till kunden skickas automatiskt av Webbskap när status uppdateras — vi gör inget eget utskick.
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">4. Standardpaket</h2>
        <p className="text-sm text-muted-foreground">Förinställda mått så att personalen slipper mäta varje gång. Lägg till egna storlekar om du har ovanliga paket.</p>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          {[
            { name: "Litet (S)", dims: "25×20×5" },
            { name: "Medium (M)", dims: "35×25×15" },
            { name: "Stort (L)", dims: "50×35×25" },
          ].map((p) => (
            <div key={p.name} className="border rounded p-3">
              <strong>{p.name}</strong>
              <div className="text-xs text-muted-foreground">{p.dims} cm</div>
            </div>
          ))}
        </div>

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-medium">Egna standardmått</h3>
          <p className="text-xs text-muted-foreground">Spara dina egna förinställningar — t.ex. en specialkartong du använder ofta.</p>
          <div className="grid sm:grid-cols-5 gap-2">
            <div className="sm:col-span-2"><Label className="text-xs">Namn</Label><Input placeholder="T.ex. Tröjkartong" /></div>
            <div><Label className="text-xs">L (cm)</Label><Input type="number" placeholder="40" /></div>
            <div><Label className="text-xs">B (cm)</Label><Input type="number" placeholder="30" /></div>
            <div><Label className="text-xs">H (cm)</Label><Input type="number" placeholder="12" /></div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch /> Använd som standard på nya ordrar
            </div>
            <Button variant="outline" size="sm">Spara mått</Button>
          </div>
        </div>
      </Card>

      <Button>Spara inställningar</Button>
    </div>
  );
}

function Row({ label, sub, children }: any) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
