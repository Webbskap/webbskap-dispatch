import { useSearchParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {sessionId ? (
          <>
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold">Tack — du är aktiverad!</h1>
            <p className="text-sm text-muted-foreground">
              Din prenumeration är igång. Nästa steg: fyll i ditt PostNord-kundnummer i inställningarna så är du redo att boka.
            </p>
            <Link to="/app">
              <Button className="w-full">Öppna PostNord-portalen</Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Ingen sessioninformation</h1>
            <p className="text-sm text-muted-foreground">Vi hittade ingen aktiv betalsession. Försök igen.</p>
            <Link to="/"><Button variant="outline" className="w-full">Tillbaka till start</Button></Link>
          </>
        )}
      </Card>
    </div>
  );
}
