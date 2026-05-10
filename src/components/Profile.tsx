import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BillingSection } from "@/components/BillingSection";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, KeyRound, LogOut } from "lucide-react";

export function Profile({ userId, email }: { userId: string; email?: string | null }) {
  return (
    <div className="space-y-6 max-w-3xl">
      <AccountCard email={email} />
      <PasswordCard />
      <BillingSection userId={userId} />
      <SignOutCard />
    </div>
  );
}

function AccountCard({ email }: { email?: string | null }) {
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const saveEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      toast.error("Ange en giltig e-postadress");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setBusy(false);
    if (error) {
      toast.error(`Kunde inte byta e-post: ${error.message}`);
      return;
    }
    toast.success("Bekräftelsemejl skickat till nya adressen. Klicka länken där för att slutföra bytet.");
    setEditing(false);
    setNewEmail("");
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4" /> Konto
        </h2>
        <p className="text-sm text-muted-foreground">Din inloggningsadress.</p>
      </div>
      {!editing ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-mono">{email ?? "—"}</div>
          <Button variant="outline" size="sm" onClick={() => { setEditing(true); setNewEmail(email ?? ""); }}>
            Byt e-post
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Ny e-post</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Vi skickar ett bekräftelsemejl till den nya adressen. Bytet träder i kraft först när du bekräftat.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveEmail} disabled={busy} size="sm">
              {busy ? "Sparar…" : "Spara"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setNewEmail(""); }}>
              Avbryt
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PasswordCard() {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async () => {
    if (pw1.length < 8) {
      toast.error("Lösenordet måste vara minst 8 tecken");
      return;
    }
    if (pw1 !== pw2) {
      toast.error("Lösenorden matchar inte");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (error) {
      toast.error(`Kunde inte byta lösenord: ${error.message}`);
      return;
    }
    toast.success("Lösenord uppdaterat");
    setPw1("");
    setPw2("");
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Lösenord
        </h2>
        <p className="text-sm text-muted-foreground">Byt ditt inloggningslösenord. Minst 8 tecken.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pw1">Nytt lösenord</Label>
          <Input id="pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">Bekräfta lösenord</Label>
          <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </div>
      </div>
      <Button onClick={change} disabled={busy || !pw1 || !pw2} size="sm">
        {busy ? "Uppdaterar…" : "Uppdatera lösenord"}
      </Button>
    </Card>
  );
}

function SignOutCard() {
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    await supabase.auth.signOut();
  };
  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <LogOut className="h-4 w-4" /> Logga ut
        </h2>
        <p className="text-sm text-muted-foreground">Avsluta din session i denna webbläsare.</p>
      </div>
      <Separator />
      <Button variant="outline" onClick={out} disabled={busy} size="sm">
        {busy ? "Loggar ut…" : "Logga ut"}
      </Button>
    </Card>
  );
}
