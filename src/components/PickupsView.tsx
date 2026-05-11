import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tenant } from "@/hooks/useAuthAndTenant";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PickupModal } from "@/components/PickupModal";
import { toast } from "sonner";
import { Truck, Plus, Inbox, ExternalLink, RefreshCw, Package } from "lucide-react";

type Pickup = any;
type Shipment = any;
type Order = any;
type Draft = any;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  booked: "default", pending: "secondary", cancelled: "outline", failed: "destructive",
};
const STATUS_LABEL: Record<string, string> = {
  booked: "Bokad", pending: "Skickar…", cancelled: "Avbokad", failed: "Misslyckad",
};
const TYPE_LABEL: Record<string, string> = { p1: "Företagsadress", p2: "Privatadress" };

function nextWorkday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function PickupsView({ tenant }: { tenant: Tenant }) {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [standaloneOpen, setStandaloneOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [{ data: ps }, { data: ss }, { data: os }, { data: ds }] = await Promise.all([
      (supabase as any).from("pickup_bookings")
        .select("*").eq("tenant_id", tenant.id)
        .order("pickup_date", { ascending: false }).limit(200),
      supabase.from("shipments")
        .select("*").eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("orders")
        .select("id, webbskap_order_id, invoice_no, customer_name, shipping_address")
        .eq("tenant_id", tenant.id).limit(500),
      supabase.from("shipment_drafts")
        .select("id, weight_kg, parcels").eq("tenant_id", tenant.id),
    ]);
    setPickups(ps ?? []);
    setShipments(ss ?? []);
    setOrders(Object.fromEntries((os ?? []).map((o: any) => [o.id, o])));
    setDrafts(Object.fromEntries((ds ?? []).map((d: any) => [d.id, d])));
    setLoading(false);
    setRefreshing(false);
  }, [tenant.id]);

  useEffect(() => {
    refresh();
    const channelName = `pickups-${tenant.id}-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase.channel(channelName);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pickup_bookings", filter: `tenant_id=eq.${tenant.id}` },
      refresh,
    );
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shipments", filter: `tenant_id=eq.${tenant.id}` },
      refresh,
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenant.id, refresh]);

  // Shipments that are booked but waiting for a pickup
  const waitingShipments = useMemo(
    () => (shipments ?? []).filter(
      (s) => s.status === "booked" && !s.pickup_booking_id,
    ),
    [shipments],
  );

  if (loading) return <div className="text-sm text-muted-foreground">Laddar…</div>;

  // Group pickups
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = pickups.filter((p) => p.pickup_date >= today && p.status !== "cancelled");
  const past = pickups.filter((p) => !(p.pickup_date >= today && p.status !== "cancelled"));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5" /> Upphämtningar
          </h2>
          <p className="text-sm text-muted-foreground">
            Boka PostNord-upphämtning för bokade försändelser, eller boka fristående.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStandaloneOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Fristående upphämtning
          </Button>
        </div>
      </div>

      <PickupBuilder
        waiting={waitingShipments}
        orders={orders}
        drafts={drafts}
        selected={selected}
        setSelected={setSelected}
        onBooked={() => { setSelected(new Set()); refresh(); }}
      />

      {pickups.length === 0 ? null : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Kommande</h3>
              {upcoming.map((p) => (
                <PickupCard key={p.id} pickup={p} shipments={shipments.filter((s) => s.pickup_booking_id === p.id)} orders={orders} />
              ))}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Tidigare</h3>
              {past.map((p) => (
                <PickupCard key={p.id} pickup={p} shipments={shipments.filter((s) => s.pickup_booking_id === p.id)} orders={orders} />
              ))}
            </section>
          )}
        </>
      )}

      <PickupModal open={standaloneOpen} onOpenChange={setStandaloneOpen} onBooked={refresh} />
    </div>
  );
}

function PickupBuilder({
  waiting, orders, drafts, selected, setSelected, onBooked,
}: {
  waiting: Shipment[];
  orders: Record<string, Order>;
  drafts: Record<string, Draft>;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onBooked: () => void;
}) {
  const [date, setDate] = useState(nextWorkday());
  const [type, setType] = useState<"p1" | "p2">("p2");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedShipments = waiting.filter((s) => selected.has(s.id));
  const totalParcels = selectedShipments.reduce((acc, s) => {
    const d = s.draft_id ? drafts[s.draft_id] : null;
    return acc + Math.max(1, Math.floor(Number(d?.parcels ?? 1)));
  }, 0);
  const totalWeight = selectedShipments.reduce((acc, s) => {
    const d = s.draft_id ? drafts[s.draft_id] : null;
    return acc + Number(d?.weight_kg ?? 0);
  }, 0);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === waiting.length) setSelected(new Set());
    else setSelected(new Set(waiting.map((s) => s.id)));
  };

  const book = async () => {
    if (selectedShipments.length === 0) {
      toast.error("Välj minst en order");
      return;
    }
    if (!instruction.trim()) {
      toast.error("Skriv en upphämtningsinstruktion");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("book-pickup", {
      body: {
        shipment_ids: Array.from(selected),
        pickup_date: date,
        pickup_type: type,
        instruction: instruction.trim(),
      },
    });
    setBusy(false);
    const res = data as any;
    if (error || res?.error) {
      toast.error(res?.message ?? res?.details ?? res?.error ?? error?.message ?? "Bokning misslyckades");
      return;
    }
    toast.success(`Upphämtning bokad för ${selectedShipments.length} försändelser!`);
    setInstruction("");
    onBooked();
  };

  if (waiting.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
        Inga bokade försändelser väntar på upphämtning just nu.
        <div className="text-xs mt-2">
          Boka först en försändelse under fliken "Ordrar".
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-medium">Boka gemensam upphämtning</h3>
          <p className="text-xs text-muted-foreground">
            Välj försändelser som ska hämtas samtidigt. En upphämtning bokas hos PostNord för alla valda.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {selected.size === waiting.length ? "Avmarkera alla" : "Välj alla"}
        </Button>
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {waiting.map((s) => {
          const order = s.order_id ? orders[s.order_id] : null;
          const draft = s.draft_id ? drafts[s.draft_id] : null;
          const isSelected = selected.has(s.id);
          return (
            <label
              key={s.id}
              className={`flex items-start gap-3 p-2 rounded-md cursor-pointer hover:bg-accent ${
                isSelected ? "bg-accent" : ""
              }`}
            >
              <Checkbox checked={isSelected} onCheckedChange={() => toggle(s.id)} className="mt-1" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    #{order?.invoice_no ?? order?.webbskap_order_id ?? "—"}
                  </span>
                  {order?.customer_name && (
                    <span className="text-sm text-muted-foreground truncate">{order.customer_name}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {draft?.parcels ?? 1} kollin · {draft?.weight_kg ?? "?"} kg
                  {s.tracking_no && <> · <span className="font-mono">{s.tracking_no}</span></>}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {selected.size > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">Valt: </span>
              {selectedShipments.length} försändelser, {totalParcels} kollin, totalt {totalWeight.toFixed(2)} kg
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pb-date">Upphämtningsdag</Label>
                <Input id="pb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
              </div>
              <div>
                <Label htmlFor="pb-type">Typ av adress</Label>
                <Select value={type} onValueChange={(v: "p1" | "p2") => setType(v)}>
                  <SelectTrigger id="pb-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p2">Privatadress (p2)</SelectItem>
                    <SelectItem value="p1">Företagsadress (p1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="pb-instr">Upphämtningsinstruktion</Label>
              <Textarea
                id="pb-instr"
                placeholder="T.ex. 'Kollin står utanför entrén'"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={book} disabled={busy}>
                {busy ? "Bokar…" : `Boka upphämtning för ${selectedShipments.length} ${selectedShipments.length === 1 ? "försändelse" : "försändelser"}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function PickupCard({
  pickup, shipments, orders,
}: {
  pickup: Pickup;
  shipments: Shipment[];
  orders: Record<string, Order>;
}) {
  const statusVariant = STATUS_VARIANT[pickup.status] ?? "outline";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{formatDate(pickup.pickup_date)}</span>
            <Badge variant={statusVariant}>{STATUS_LABEL[pickup.status] ?? pickup.status}</Badge>
            {pickup.pickup_id && (
              <span className="text-xs font-mono text-muted-foreground">{pickup.pickup_id}</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {pickup.parcels} kollin · {Number(pickup.total_weight_kg)} kg · {TYPE_LABEL[pickup.pickup_type] ?? pickup.pickup_type}
          </div>
          <div className="text-sm truncate">
            {pickup.pickup_company || pickup.pickup_name}, {pickup.pickup_address}, {pickup.pickup_zip} {pickup.pickup_city}
          </div>
          {pickup.instruction && (
            <div className="text-sm text-muted-foreground italic truncate">
              "{pickup.instruction}"
            </div>
          )}
          {shipments.length > 0 && (
            <div className="text-xs text-muted-foreground pt-1">
              Kopplade ordrar:{" "}
              {shipments
                .map((s) => {
                  const o = s.order_id ? orders[s.order_id] : null;
                  return o ? `#${o.invoice_no ?? o.webbskap_order_id}` : null;
                })
                .filter(Boolean)
                .join(", ")}
            </div>
          )}
          {pickup.error && (
            <div className="text-sm text-destructive">{pickup.error}</div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {pickup.tracking_url && (
            <a href={pickup.tracking_url} target="_blank" rel="noreferrer"
               className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Spåra <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
