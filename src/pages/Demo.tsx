import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Settings, CheckCircle2, Truck, MapPin, Inbox, RefreshCw } from "lucide-react";

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
  shipment?: { tracking_no: string; status: "booked" | "in_transit" | "delivered"; booked_at: string; events: TrackEvent[] };
};

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

export default function Demo() {
  const [view, setView] = useState<"orders" | "settings">("orders");
  const [orders, setOrders] = useState(SAMPLE);
  const [selected, setSelected] = useState<string | null>(SAMPLE[0].id);
  const [orderTab, setOrderTab] = useState<"active" | "done">("active");

  const sel = useMemo(() => orders.find((o) => o.id === selected) ?? null, [orders, selected]);
  const active = orders.filter((o) => o.shipment?.status !== "delivered");
  const done = orders.filter((o) => o.shipment?.status === "delivered");
  const visible = orderTab === "active" ? active : done;

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-amber-100 dark:bg-amber-900/30 border-b border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs px-4 py-2 text-center">
        🔒 Förhandsvisning (demo) — endast för dig. Ingen riktig data, inget skickas till PostNord eller Webbskap.
      </div>

      <div className="flex min-h-[calc(100vh-33px)]">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-60 border-r bg-muted/30 shrink-0">
          <div className="p-4 border-b">
            <div className="font-semibold text-sm">PostNord-portal</div>
            <div className="text-xs text-muted-foreground mt-0.5">Demo-butik</div>
            <div className="text-[10px] text-muted-foreground mt-2">demo.webbskap.se</div>
          </div>
          <nav className="p-2 space-y-1 flex-1">
            <SideItem icon={<Package className="h-4 w-4" />} active={view === "orders"} onClick={() => setView("orders")} label="Ordrar" badge={active.length} />
            <SideItem icon={<Settings className="h-4 w-4" />} active={view === "settings"} onClick={() => setView("settings")} label="Inställningar" />
          </nav>
          <div className="p-3 border-t text-[11px] text-muted-foreground leading-relaxed">
            Inloggning sker automatiskt när fliken öppnas från Webbskap.
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="lg:hidden fixed top-[33px] inset-x-0 z-10 border-b bg-background">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="font-semibold text-sm">PostNord-portal</div>
            <div className="flex gap-1">
              <Button size="sm" variant={view === "orders" ? "default" : "ghost"} onClick={() => setView("orders")}>Ordrar</Button>
              <Button size="sm" variant={view === "settings" ? "default" : "ghost"} onClick={() => setView("settings")}>Inställningar</Button>
            </div>
          </div>
        </div>

        <main className="flex-1 px-4 py-6 lg:py-6 pt-16 lg:pt-6 max-w-6xl">
          {view === "orders" ? (
            <>
              <Tabs value={orderTab} onValueChange={(v) => setOrderTab(v as any)} className="mb-4">
                <TabsList>
                  <TabsTrigger value="active" className="gap-2">
                    <Inbox className="h-4 w-4" /> Aktiva <Badge variant="secondary" className="ml-1">{active.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="done" className="gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Klara <Badge variant="secondary" className="ml-1">{done.length}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

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
                  ? <DemoDetail order={sel} onBook={() => handleBook(sel.id)} />
                  : <Card className="p-6 text-muted-foreground">Välj en order till vänster.</Card>}
              </div>
            </>
          ) : (
            <DemoSettings />
          )}
        </main>
      </div>
    </div>
  );
}

function SideItem({ icon, label, active, onClick, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition ${active ? "bg-background shadow-sm font-medium" : "hover:bg-background/60 text-muted-foreground"}`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && <Badge variant="secondary">{badge}</Badge>}
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

function DemoDetail({ order, onBook }: { order: DemoOrder; onBook: () => void }) {
  const [d, setD] = useState(order.draft);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ship = order.shipping_address;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xl font-semibold">#{order.invoice_no}</div>
          <div className="text-sm text-muted-foreground">{order.customer_name} · {order.customer_email}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => alert("Demo: skulle öppna utskrift av följesedel")}>Följesedel</Button>
          {order.shipment
            ? <Button onClick={() => alert("Demo: skulle ladda ner fraktsedel.pdf")}>Ladda ner fraktsedel</Button>
            : <Button onClick={() => setConfirmOpen(true)}>Boka & skriv fraktsedel</Button>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <section>
          <h3 className="text-sm font-medium mb-2">Mottagare</h3>
          <div className="text-sm">
            {ship.name}<br />{ship.address}<br />{ship.address2}<br />
            {ship.zipCode} {ship.city}<br />{ship.country} · {ship.phone}
          </div>
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
          <h3 className="text-sm font-medium">Fraktdetaljer (redigerbart)</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><Label>Service</Label><Input value={d.service_code} onChange={(e) => setD({ ...d, service_code: e.target.value })} /></div>
            <div><Label>Antal kolli</Label><Input type="number" value={d.parcels} onChange={(e) => setD({ ...d, parcels: +e.target.value })} /></div>
            <div><Label>Vikt (kg)</Label><Input type="number" step="0.01" value={d.weight_kg} onChange={(e) => setD({ ...d, weight_kg: +e.target.value })} /></div>
            <div><Label>Längd (cm)</Label><Input type="number" value={d.length_cm ?? ""} onChange={(e) => setD({ ...d, length_cm: +e.target.value })} /></div>
            <div><Label>Bredd (cm)</Label><Input type="number" value={d.width_cm ?? ""} onChange={(e) => setD({ ...d, width_cm: +e.target.value })} /></div>
            <div><Label>Höjd (cm)</Label><Input type="number" value={d.height_cm ?? ""} onChange={(e) => setD({ ...d, height_cm: +e.target.value })} /></div>
          </div>
        </section>
      )}

      {order.shipment && (
        <section className="pt-4 border-t space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm"><span className="text-muted-foreground">Tracking:</span> <code className="bg-muted px-1.5 py-0.5 rounded">{order.shipment.tracking_no}</code></div>
              <div className="text-xs text-muted-foreground mt-1">Bokad: {new Date(order.shipment.booked_at).toLocaleString("sv-SE")}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => alert("Demo: skulle hämta senaste status från PostNord")}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Uppdatera spårning
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
                  <div><span className="text-muted-foreground">Service:</span> {d.service_code} · {d.parcels} kolli · {d.weight_kg} kg</div>
                  {d.length_cm && <div><span className="text-muted-foreground">Mått:</span> {d.length_cm}×{d.width_cm}×{d.height_cm} cm</div>}
                </div>
                <div className="text-xs text-muted-foreground">Status och spårningsnummer skickas automatiskt tillbaka till ordern i Webbskap.</div>
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

function DemoSettings() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">1. Webbskap-koppling</h2>
        <p className="text-sm text-muted-foreground">
          Inloggning sker automatiskt när kunden öppnar fliken från Webbskaps E-handelsverktyg —
          ingen separat inloggning behövs. Webhook och API-nyckel sätts upp en gång.
        </p>
        <div className="space-y-1">
          <Label>Webhook URL (klistra in hos Webbskap)</Label>
          <Input readOnly value="https://din-portal.lovable.app/functions/v1/webhook-ingest/<tenant-id>" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Website API-key</Label><Input placeholder="ws_••••••••" /></div>
          <div><Label>Webhook secret</Label><Input placeholder="••••••••" /></div>
        </div>
      </Card>
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">2. PostNord-uppgifter</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>API-nyckel</Label><Input placeholder="pn_••••••••" /></div>
          <div><Label>Kundnummer</Label><Input placeholder="1234567" /></div>
          <div><Label>Default service</Label><Input defaultValue="17" /></div>
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
      <Button>Spara inställningar</Button>
    </div>
  );
}
