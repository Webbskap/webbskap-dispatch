import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tenant } from "@/hooks/useAuthAndTenant";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const SERVICE_NAMES: Record<string, string> = {
  "17": "MyPack Home",
  "18": "Parcel (företag)",
  "19": "MyPack Collect",
  "1": "Parcel International",
};

export function StatsView({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: s }, { data: d }] = await Promise.all([
        supabase.from("orders").select("id,weight,created_at").eq("tenant_id", tenant.id).limit(1000),
        supabase.from("shipments").select("id,order_id,booked_at,status").eq("tenant_id", tenant.id).limit(1000),
        supabase.from("shipment_drafts").select("order_id,service_code").eq("tenant_id", tenant.id).limit(1000),
      ]);
      setOrders(o ?? []);
      setShipments(s ?? []);
      setDrafts(d ?? []);
      setLoading(false);
    })();
  }, [tenant.id]);

  const stats = useMemo(() => {
    const total = orders.length;
    const booked = shipments.length;
    const delivered = shipments.filter((s) => s.status === "delivered").length;
    const totalKg = orders.reduce((s, o) => s + (Number(o.weight) || 0), 0);

    const draftByOrder = new Map(drafts.map((d) => [d.order_id, d.service_code]));
    const serviceCounts = new Map<string, number>();
    for (const sh of shipments) {
      const code = draftByOrder.get(sh.order_id) ?? "okänd";
      serviceCounts.set(code, (serviceCounts.get(code) ?? 0) + 1);
    }
    const services = Array.from(serviceCounts.entries())
      .map(([code, n]) => ({ code, n, pct: booked ? Math.round((n / booked) * 100) : 0 }))
      .sort((a, b) => b.n - a.n);

    // Monthly grouping (last 6 months) based on shipments.booked_at
    const now = new Date();
    const months: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("sv-SE", { month: "short", year: "numeric" }), count: 0 });
    }
    const monthMap = new Map(months.map((m) => [m.key, m]));
    for (const sh of shipments) {
      if (!sh.booked_at) continue;
      const d = new Date(sh.booked_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = monthMap.get(key);
      if (m) m.count++;
    }
    const maxMonth = Math.max(1, ...months.map((m) => m.count));

    return { total, booked, delivered, totalKg, services, months, maxMonth };
  }, [orders, shipments, drafts]);

  if (loading) return <div className="text-muted-foreground">Laddar statistik…</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Ordrar" value={stats.total} />
        <Stat label="Bokade" value={stats.booked} />
        <Stat label="Levererade" value={stats.delivered} />
        <Stat label="Total vikt" value={`${stats.totalKg.toFixed(1)} kg`} />
      </div>

      <Card className="p-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Tjänstefördelning
        </h3>
        {stats.services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga bokade sändningar än.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {stats.services.map((s) => (
              <Bar
                key={s.code}
                label={`${SERVICE_NAMES[s.code] ?? "Okänd"} (${s.code})`}
                pct={s.pct}
                count={s.n}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-medium mb-3">Bokningar senaste 6 månaderna</h3>
        <div className="flex items-end gap-3 h-32">
          {stats.months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-xs font-medium">{m.count}</div>
              <div
                className="w-full bg-primary/80 rounded-t min-h-[2px]"
                style={{ height: `${(m.count / stats.maxMonth) * 100}%` }}
              />
              <div className="text-xs text-muted-foreground whitespace-nowrap">{m.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function Bar({ label, pct, count }: { label: string; pct: number; count: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{count} st · {pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded mt-1">
        <div className="h-full bg-primary rounded" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
