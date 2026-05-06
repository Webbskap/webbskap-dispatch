import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package, Truck, Clock, FileText, Undo2, BarChart3,
  CheckCircle2, Sparkles, Zap, ShieldCheck, ArrowRight,
} from "lucide-react";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />

      {/* Header */}
      <header className="border-b sticky top-0 z-20 bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground">
              <Package className="h-4 w-4" />
            </div>
            PostNord-portal
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/demo" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">
              Se demo
            </Link>
            <Button size="sm" onClick={() => navigate("/checkout?plan=postnord_portal_monthly")}>
              Aktivera
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="max-w-6xl mx-auto px-4 py-20 sm:py-28 text-center">
          <Badge variant="secondary" className="mb-6">
            <Sparkles className="h-3 w-3 mr-1" /> Officiellt tillägg för Webbskap
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl mx-auto">
            Boka PostNord-frakt direkt i din Webbskap-butik
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Slipp logga in på PostNord. Skriv ut fraktsedel, boka upphämtning och spåra paket — allt från orderlistan i ditt e-handelsverktyg.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="h-12 px-6" onClick={() => navigate("/checkout?plan=postnord_portal_monthly")}>
              Aktivera — 199 kr/mån <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Link to="/demo">
              <Button size="lg" variant="outline" className="h-12 px-6">Se hur det fungerar</Button>
            </Link>
          </div>
          <div className="mt-4 text-xs text-muted-foreground">Säg upp när du vill · Inga bindningstider · Stripe sköter betalningen</div>
        </div>
      </section>

      {/* Pain points */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Slut på att hoppa mellan flikar</h2>
            <p className="mt-3 text-muted-foreground">
              Vanlig dag utan portalen: öppna Webbskap, kopiera adressen, byt flik, logga in på PostNord, klistra in, boka, ladda ner PDF, byt tillbaka och uppdatera ordern manuellt. För 30 ordrar är det <strong>30 gånger</strong>.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {[
                "Bokning klar på 2 klick — inte 8",
                "Tracking-status skickas tillbaka till ordern automatiskt",
                "Webbskap mailar kunden — du gör inget extra",
                "Fraktrapport per månad för bokföringen",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <Card className="p-6 bg-muted/40">
            <div className="text-xs text-muted-foreground mb-2">Tidsbesparing</div>
            <div className="text-5xl font-bold">~3 min</div>
            <div className="text-sm text-muted-foreground">sparad per order</div>
            <div className="border-t my-4" />
            <div className="text-sm">
              30 ordrar/dag × 3 min × 22 arbetsdagar =<br />
              <strong className="text-foreground text-lg">33 timmar i månaden</strong>
            </div>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">Allt du behöver för frakthanteringen</h2>
        <p className="mt-3 text-center text-muted-foreground max-w-xl mx-auto">
          Byggd för Webbskap-butiker som skickar paket varje dag.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {[
            { icon: Zap, title: "Boka direkt från ordern", desc: "Klicka, välj tjänst, skriv ut fraktsedel. Klart." },
            { icon: Truck, title: "Live-spårning", desc: "Status uppdateras automatiskt — både i appen och i Webbskap-ordern." },
            { icon: Clock, title: "Boka upphämtning", desc: "PostNord hämtar hos dig. Vi visar deras schema så du bara kan välja giltiga tider." },
            { icon: Undo2, title: "Retursedlar med ett klick", desc: "Skapa retur och e-posta direkt till kunden." },
            { icon: FileText, title: "Fraktrapport per månad", desc: "Färdig PDF/CSV för bokföringen — med riktiga PostNord-priser." },
            { icon: BarChart3, title: "Statistik & inställningar", desc: "Se vilka tjänster du använder mest. Spara dina egna paketmått." },
          ].map((f) => (
            <Card key={f.title} className="p-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="font-semibold">{f.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{f.desc}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">Enkel prissättning</h2>
        <p className="mt-3 text-center text-muted-foreground">En plan. Säg upp när du vill.</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-10 max-w-3xl mx-auto">
          <Card className="p-8 relative">
            <div className="text-sm font-medium text-muted-foreground">Månad</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold">199 kr</span>
              <span className="text-muted-foreground">/mån</span>
            </div>
            <div className="text-xs text-muted-foreground">exkl. moms · säg upp när du vill</div>
            <Button className="w-full mt-6" variant="outline" onClick={() => navigate("/checkout?plan=postnord_portal_monthly")}>
              Välj månad
            </Button>
          </Card>
          <Card className="p-8 relative border-primary ring-2 ring-primary/20">
            <Badge className="absolute -top-3 right-6">Spara 20%</Badge>
            <div className="text-sm font-medium text-muted-foreground">År</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold">1 990 kr</span>
              <span className="text-muted-foreground">/år</span>
            </div>
            <div className="text-xs text-muted-foreground">exkl. moms · ~166 kr/mån</div>
            <Button className="w-full mt-6" onClick={() => navigate("/checkout?plan=postnord_portal_yearly")}>
              Välj år
            </Button>
          </Card>
        </div>
        <ul className="mt-8 grid sm:grid-cols-2 gap-2 max-w-2xl mx-auto text-sm">
          {[
            "Obegränsat antal bokningar",
            "Alla PostNord-tjänster (MyPack, DPD, värdepaket m.fl.)",
            "Live-spårning & retursedlar",
            "Fraktrapport per månad (PDF/CSV)",
            "Upphämtning av paket",
            "Svensk support",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> {t}
            </li>
          ))}
        </ul>
      </section>

      {/* Trust */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <Card className="p-8 bg-muted/40">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Säker betalning via Stripe</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Officiell PostNord-integration</div>
            <div className="flex items-center gap-2"><Package className="h-5 w-5" /> Byggd för Webbskap</div>
          </div>
        </Card>
      </section>

      {/* Footer CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <Card className="p-10 text-center bg-gradient-to-br from-primary/10 to-primary/5">
          <h3 className="text-2xl sm:text-3xl font-bold">Redo att slippa PostNord-fliken?</h3>
          <p className="mt-2 text-muted-foreground">Aktivera nu — du är igång om 2 minuter.</p>
          <Button size="lg" className="mt-6 h-12 px-6" onClick={() => navigate("/checkout?plan=postnord_portal_monthly")}>
            Aktivera — 199 kr/mån
          </Button>
        </Card>
      </section>
    </div>
  );
}
