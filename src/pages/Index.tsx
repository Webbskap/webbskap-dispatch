import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthAndTenant } from "@/hooks/useAuthAndTenant";
import { useSubscription } from "@/hooks/useSubscription";
import { Onboarding } from "@/components/Onboarding";
import { OrdersView } from "@/components/OrdersView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export default function Index() {
  const { session, tenant, loading, error } = useAuthAndTenant();
  const { isActive, loading: subLoading } = useSubscription(session?.user?.id);
  const [tab, setTab] = useState<"orders" | "settings">("orders");
  const [devEmail, setDevEmail] = useState("");

  if (loading || subLoading) return <Centered>Laddar…</Centered>;

  if (!session) {
    return (
      <Centered>
        <Card className="p-6 max-w-md w-full space-y-4">
          <h1 className="text-xl font-semibold">PostNord-portal</h1>
          <p className="text-sm text-muted-foreground">
            Den här fliken öppnas normalt automatiskt från Webbskap. För testning kan du logga in med e-post.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <input
            type="email"
            placeholder="din@email.se"
            className="w-full border rounded px-3 py-2 bg-background"
            value={devEmail}
            onChange={(e) => setDevEmail(e.target.value)}
          />
          <Button
            className="w-full"
            onClick={async () => {
              const { error } = await supabase.auth.signInWithOtp({
                email: devEmail,
                options: { emailRedirectTo: window.location.origin },
              });
              if (error) toast.error(error.message);
              else toast.success("Magisk länk skickad");
            }}
          >
            Skicka magisk länk
          </Button>
        </Card>
      </Centered>
    );
  }

  if (!tenant) {
    return (
      <Centered>
        <Card className="p-6 max-w-md text-sm space-y-3">
          <h2 className="font-semibold">Ingen sajt kopplad</h2>
          <p className="text-muted-foreground">
            Ditt konto har inte tilldelats någon Webbskap-sajt än. Öppna fliken via Webbskap för att aktivera.
          </p>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>Logga ut</Button>
        </Card>
      </Centered>
    );
  }

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold">PostNord-portal</h1>
            <p className="text-xs text-muted-foreground">{tenant.display_name ?? tenant.subdomain}</p>
          </div>
          <nav className="flex gap-1">
            <Button variant={tab === "orders" ? "default" : "ghost"} size="sm" onClick={() => setTab("orders")}>
              Ordrar
            </Button>
            <Button variant={tab === "settings" ? "default" : "ghost"} size="sm" onClick={() => setTab("settings")}>
              Inställningar
            </Button>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "orders" ? <OrdersView tenant={tenant} /> : <Onboarding tenant={tenant} userId={session.user.id} />}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6 bg-background">{children}</div>;
}
