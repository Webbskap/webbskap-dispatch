import { useSearchParams, Link } from "react-router-dom";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { ArrowLeft } from "lucide-react";

export default function Checkout() {
  const [params] = useSearchParams();
  const priceId = params.get("plan") ?? "postnord_portal_monthly";
  const returnUrl = `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Tillbaka
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-1">Slutför aktivering</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {priceId === "postnord_portal_yearly" ? "Årsplan — 1 990 kr/år" : "Månadsplan — 199 kr/mån"}
        </p>
        <StripeEmbeddedCheckout priceId={priceId} returnUrl={returnUrl} />
      </main>
    </div>
  );
}
