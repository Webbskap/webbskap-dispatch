import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthAndTenant } from "@/hooks/useAuthAndTenant";
import { useSubscription } from "@/hooks/useSubscription";
import { Onboarding } from "@/components/Onboarding";
import { OrdersView } from "@/components/OrdersView";
import { StatsView } from "@/components/StatsView";
import { AuthForm } from "@/components/AuthForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Package, Settings, LogOut, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function PlanBadge({ sub, onClick }: { sub: any; onClick: () => void }) {
  if (!sub) return null;
  const isYear = sub.price_id === "postnord_portal_yearly";
  const label = sub.cancel_at_period_end
    ? "Uppsagd"
    : sub.status === "past_due"
    ? "Försenad betalning"
    : isYear ? "Årsplan" : "Månadsplan";
  const variant = sub.status === "past_due" ? "destructive" : sub.cancel_at_period_end ? "outline" : "secondary";
  return (
    <button onClick={onClick} className="hidden sm:inline-flex" title="Hantera prenumeration">
      <Badge variant={variant as any}>{label}</Badge>
    </button>
  );
}

export default function Index() {
  const { session, tenant, loading, error, refetchTenant } = useAuthAndTenant();
  const { isActive, loading: subLoading, subscription } = useSubscription(session?.user?.id);
  const [tab, setTab] = useState<"orders" | "stats" | "settings">("orders");

  if (loading) return <Centered>Laddar…</Centered>;

  if (!session) {
    return (
      <Centered>
        <div className="w-full max-w-md space-y-3">
          <AuthForm />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
      </Centered>
    );
  }

  if (subLoading || !tenant) return <Centered>Förbereder ditt konto…</Centered>;

  if (!isActive) {
    return (
      <Centered>
        <Card className="p-8 max-w-md w-full text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Aktivera PostNord-portalen</h2>
          <p className="text-sm text-muted-foreground">
            Din butik är kopplad, men prenumerationen är inte aktiv. Aktivera för 199 kr/mån för att börja boka frakt direkt från ordrarna.
          </p>
          <Link to="/checkout?plan=postnord_portal_monthly">
            <Button className="w-full">Aktivera nu</Button>
          </Link>
          <Link to="/" className="block text-xs text-muted-foreground hover:underline">Läs mer om tjänsten</Link>
        </Card>
      </Centered>
    );
  }

  const shopUrl = tenant.subdomain ? `${tenant.subdomain}.webbskap.se` : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-semibold text-sm whitespace-nowrap">PostNord-portal</div>
            {shopUrl && (
              <a
                href={`https://${shopUrl}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground hidden sm:inline truncate"
                title="Öppna din butik"
              >
                {shopUrl}
              </a>
            )}
            <PlanBadge sub={subscription} onClick={() => setTab("settings")} />
          </div>
          <nav className="flex items-center gap-1">
            <NavBtn active={tab === "orders"} onClick={() => setTab("orders")} icon={<Package className="h-4 w-4" />} label="Ordrar" />
            <NavBtn active={tab === "stats"} onClick={() => setTab("stats")} icon={<BarChart3 className="h-4 w-4" />} label="Statistik" />
            <NavBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings className="h-4 w-4" />} label="Inställningar" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => supabase.auth.signOut()}
              title="Logga ut"
              className="ml-1"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "orders" && <OrdersView tenant={tenant} />}
        {tab === "stats" && <StatsView tenant={tenant} />}
        {tab === "settings" && <Onboarding tenant={tenant} userId={session.user.id} onTenantUpdated={refetchTenant} />}
      </main>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition whitespace-nowrap ${
        active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6 bg-background">{children}</div>;
}
