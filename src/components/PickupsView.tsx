import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tenant } from "@/hooks/useAuthAndTenant";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PickupModal } from "@/components/PickupModal";
import { Truck, Plus, Inbox, ExternalLink, RefreshCw } from "lucide-react";

type Pickup = any;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  booked: "default",
  pending: "secondary",
  cancelled: "outline",
  failed: "destructive",
};
const STATUS_LABEL: Record<string, string> = {
  booked: "Bokad",
  pending: "Skickar…",
  cancelled: "Avbokad",
  failed: "Misslyckad",
};
const TYPE_LABEL: Record<string, string> = {
  p1: "Företagsadress",
  p2: "Privatadress",
};

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function PickupsView({ tenant }: { tenant: Tenant }) {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    // pickup_bookings is created via migration; cast until Supabase types are regenerated.
    const { data } = await (supabase as any)
      .from("pickup_bookings")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("pickup_date", { ascending: false })
      .limit(200);
    setPickups(data ?? []);
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
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenant.id, refresh]);

  if (loading) return <div className="text-sm text-muted-foreground">Laddar upphämtningar…</div>;

  // Group by future vs past
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
            Boka PostNord-upphämtning. Hoppa över detta om du har en återkommande rutt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Boka upphämtning
          </Button>
        </div>
      </div>

      {pickups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Inga upphämtningar bokade ännu.
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Kommande</h3>
              {upcoming.map((p) => <PickupCard key={p.id} pickup={p} />)}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Tidigare</h3>
              {past.map((p) => <PickupCard key={p.id} pickup={p} />)}
            </section>
          )}
        </>
      )}

      <PickupModal open={modalOpen} onOpenChange={setModalOpen} onBooked={refresh} />
    </div>
  );
}

function PickupCard({ pickup }: { pickup: Pickup }) {
  const statusVariant = STATUS_VARIANT[pickup.status] ?? "outline";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{formatDate(pickup.pickup_date)}</span>
            <Badge variant={statusVariant}>{STATUS_LABEL[pickup.status] ?? pickup.status}</Badge>
            {pickup.pickup_id && (
              <span className="text-xs font-mono text-muted-foreground">{pickup.pickup_id}</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">
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
          {pickup.error && (
            <div className="text-sm text-destructive">
              {pickup.error}
            </div>
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
