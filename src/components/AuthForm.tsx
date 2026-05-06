import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function AuthForm() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
        // Session is set immediately if email confirm is off; otherwise prompt.
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.functions.invoke("provision-tenant");
          toast.success("Konto skapat!");
        } else {
          toast.success("Kolla din mejl för att verifiera kontot.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Make sure tenant exists for legacy users
        await supabase.functions.invoke("provision-tenant");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Något gick fel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 max-w-md w-full space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">PostNord-portal</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "signup"
            ? "Skapa ett konto för att komma igång. Det tar 30 sekunder."
            : "Logga in för att hantera dina ordrar och frakter."}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="email">E-post</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="din@butik.se"
          />
        </div>
        <div>
          <Label htmlFor="password">Lösenord</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Minst 8 tecken" : ""}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {mode === "signup" ? "Skapa konto & fortsätt" : "Logga in"}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>
            Har du redan ett konto?{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => setMode("login")}>
              Logga in
            </button>
          </>
        ) : (
          <>
            Ny här?{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => setMode("signup")}>
              Skapa konto
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
