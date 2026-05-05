import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Standalone demo — hardcoded data, no backend, no Webbskap.
// Lets you preview the UI before exposing it to customers.

type DemoOrder = {
  id: string;
  invoice_no: string;
  customer_name: string;
  customer_email: string;
  total: number;
  currency: string;
  weight: number;
  status: "pending" | "shipped";
  shipping_address: {
    name: string; address: string; address2?: string;
    zipCode: string; city: string; country: string; phone: string;
  };
  items: { name: string; sku: string; quantity: number }[];
  draft: { service_code: string; parcels: number; weight_kg: number; length_cm?: number; width_cm?: number; height_cm?: number; notes?: string };
  shipment?: { tracking_no: string; status: string; booked_at: string };
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
    shipment: { tracking_no: "JJFI00000000012345", status: "delivered", booked_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  },
  {
    id: "3", invoice_no: "1040",
    customer_name: "Maja Lindberg", customer_email: "maja@example.se",
    total: 249, currency: "SEK", weight: 0.4, status: "pending",
    shipping_address: { name: "Maja Lindberg", address: "Kungsgatan 45", address2: "Lgh 1203", zipCode: "21145", city: "Malmö", country: "SE", phone: "+46703334455" },
    items: [{ name: "Doftljus", sku: "CDL-VAN", quantity: 3 }],
    draft: { service_code: "17", parcels: 1, weight_kg: 0.4 },
  },
];

export default function Demo() {
  const [tab, setTab] = useState<"orders" | "settings">("orders");
  const [orders, setOrders] = useState(SAMPLE);
  const [selected, setSelected] = useState<string | null>(SAMPLE[0].id);
  const sel = useMemo(() => orders.find((o) => o.id === selected) ?? null, [orders, selected]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-amber-100 dark:bg-amber-900/30 border-b border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs px-4 py-2 text-center">
        🔒 Förhandsvisning (demo) — endast för dig. Ingen riktig data, inget skickas till PostNord eller Webbskap.
      </div>
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold">PostNord-portal <span className="text-xs text-muted-foreground">· demo</span></h1>
            <p className="text-xs text-muted-foreground">Demo-butik · demo.webbskap.se</p>
          </div>
          <nav className="flex gap-1">
            <Button variant={tab === "orders" ? "default" : "ghost"} size="sm" onClick={() => setTab("orders")}>Ordrar</Button>
            <Button variant={tab === "settings" ? "default" : "ghost"} size="sm" onClick={() => setTab("settings")}>Inställningar</Button>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "orders" ? (
          <div className="grid lg:grid-cols-[380px_1fr] gap-4">
            <Card className="p-2 max-h-[75vh] overflow-auto">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelected(o.id)}
                  className={`w-full text-left p-3 rounded hover:bg-muted ${selected === o.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">#{o.invoice_no}</div>
                    {o.shipment ? <Badge variant="secondary">{o.shipment.status}</Badge> : <Badge>{o.status}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{o.total} {o.currency} · {o.weight} kg</div>
                </button>
              ))}
            </Card>
            {sel ? <DemoDetail order={sel} onBook={() => {
              setOrders((prev) => prev.map((p) => p.id === sel.id ? { ...p, status: "shipped", shipment: { tracking_no: "JJFI00000000099999", status: "booked", booked_at: new Date().toISOString() } } : p));
            }} /> : <Card className="p-6 text-muted-foreground">Välj en order.</Card>}
          </div>
        ) : (
          <DemoSettings />
        )}
      </main>
    </div>
  );
}

function DemoDetail({ order, onBook }: { order: DemoOrder; onBook: () => void }) {
  const [d, setD] = useState(order.draft);
  const ship = order.shipping_address;
  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">#{order.invoice_no}</div>
          <div className="text-sm text-muted-foreground">{order.customer_name} · {order.customer_email}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => alert("Demo: skulle öppna utskrift av följesedel")}>Följesedel</Button>
          {order.shipment
            ? <Button onClick={() => alert("Demo: skulle ladda ner fraktsedel.pdf")}>Ladda ner fraktsedel</Button>
            : <Button onClick={onBook}>Boka & skriv fraktsedel</Button>}
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
        <section className="pt-4 border-t text-sm space-y-1">
          <div><span className="text-muted-foreground">Tracking:</span> <code>{order.shipment.tracking_no}</code></div>
          <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary">{order.shipment.status}</Badge></div>
          <div className="text-muted-foreground">Bokad: {new Date(order.shipment.booked_at).toLocaleString("sv-SE")}</div>
        </section>
      )}
    </Card>
  );
}

function DemoSettings() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">1. Webbskap-koppling</h2>
        <p className="text-sm text-muted-foreground">
          Här klistrar kunden in sin Website API-key och sätter upp en webhook hos Webbskap.
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
