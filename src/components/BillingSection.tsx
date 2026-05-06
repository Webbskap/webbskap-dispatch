import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";
import { useState } from "react";

const PLAN_LABEL: Record<string, string> = {
  postnord_portal_monthly: "Månadsplan — 199 kr/mån",
  postnord_portal_yearly: "Årsplan — 1 990 kr/år",
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Aktiv", variant: "default" },
  trialing: { label: "Provperiod", variant: "secondary" },
  past_due: { label: "Försenad betalning", variant: "destructive" },
  canceled: { label: "Uppsagd", variant: "outline" },
  incomplete: { label: "Ofullständig", variant: "outline" },
};

export function BillingSection({ userId }: { userId: string }) {
  const { subscription, isActive, loading } = useSubscription(userId);
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  const planId = subscription?.price_id;
  const otherPlan = planId === "postnord_portal_yearly" ? "postnord_portal_monthly" : "postnord_portal_yearly";
  const otherLabel = otherPlan === "postnord_portal_yearly" ? "Byt till årsplan (1 990 kr/år)" : "Byt till månadsplan (199 kr/mån)";
  const statusInfo = subscription ? STATUS_LABEL[subscription.status] ?? { label: subscription.status, variant: "outline" as const } : null;

  const openPortal = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { returnUrl: window.location.href, environment: getStripeEnvironment() },
      });
      if (error || !data?.url) throw new Error(error?.message || "Kunde inte öppna portalen");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changePlan = async () => {
    if (!confirm(`Vill du byta till ${otherLabel.replace("Byt till ", "")}? Mellanskillnaden proportioneras automatiskt.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-plan", {
        body: { newPriceId: otherPlan, environment: getStripeEnvironment() },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error || "Kunde inte byta plan");
      toast.success("Plan uppdaterad");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Prenumeration</h2>
          <p className="text-sm text-muted-foreground">Hantera din plan och betalning.</p>
        </div>
        {statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
      </div>

      {!subscription && (
        <div className="space-y-3">
          <p className="text-sm">Ingen aktiv prenumeration.</p>
          <Link to="/checkout?plan=postnord_portal_monthly">
            <Button>Aktivera nu</Button>
          </Link>
        </div>
      )}

      {subscription && (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">{PLAN_LABEL[planId ?? ""] ?? planId}</span>
          </div>
          {subscription.current_period_end && (
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">
                {subscription.cancel_at_period_end ? "Åtkomst till" : "Förnyas"}
              </span>
              <span>{new Date(subscription.current_period_end).toLocaleDateString("sv-SE")}</span>
            </div>
          )}
          {subscription.cancel_at_period_end && (
            <p className="text-xs text-muted-foreground">
              Prenumerationen är uppsagd men du har åtkomst till perioden tar slut.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {isActive && !subscription.cancel_at_period_end && (
              <Button variant="outline" size="sm" onClick={changePlan} disabled={busy}>
                {otherLabel}
              </Button>
            )}
            <Button size="sm" onClick={openPortal} disabled={busy}>
              {busy ? "Öppnar…" : "Hantera prenumeration"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Via "Hantera prenumeration" kan du uppdatera kort, ladda ner kvitton och säga upp.
          </p>
        </div>
      )}
    </Card>
  );
}
