import { Tenant } from "@/hooks/useAuthAndTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BillingSection } from "@/components/BillingSection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Copy, Check, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Kopierat");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} onClick={(e) => (e.target as HTMLInputElement).select()} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Kopiera">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function StatusRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      )}
      <div>
        <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
        {hint && !ok && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function Onboarding({ tenant, userId, onTenantUpdated }: { tenant: Tenant; userId?: string; onTenantUpdated?: () => void }) {
  const [wb, setWb] = useState({ website_api_key: "", webhook_secret: "" });
  const [subdomain, setSubdomain] = useState(tenant.subdomain ?? "");
  const [savingSubdomain, setSavingSubdomain] = useState(false);
  const [pn, setPn] = useState({
    api_key: "", customer_number: "", default_service_code: "17",
    default_label_format: "A4",
    sender_name: "", sender_company: "", sender_address: "",
    sender_zip: "", sender_city: "", sender_country: "SE",
    sender_phone: "", sender_email: "",
    environment: "sandbox" as "sandbox" | "live",
  });
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [cnValid, setCnValid] = useState<null | boolean>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ topic: string; received_at: string; verified: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: w }, { data: p }, { data: ev }] = await Promise.all([
        supabase.from("tenant_webbskap_config").select("*").eq("tenant_id", tenant.id).maybeSingle(),
        supabase.from("tenant_postnord_config").select("*").eq("tenant_id", tenant.id).maybeSingle(),
        supabase.from("webhook_events").select("topic,received_at,verified")
          .eq("tenant_id", tenant.id).order("received_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (w) setWb({ website_api_key: w.website_api_key ?? "", webhook_secret: w.webhook_secret ?? "" });
      if (p) setPn((prev) => ({ ...prev, ...p, environment: ((p as any).environment ?? "sandbox") as "sandbox" | "live" }));
      if (ev) setLastEvent(ev);
    })();
    // eslint-disable-next-line
  }, [tenant.id]);

  const save = async () => {
    setSaving(true);
    const a = await supabase.from("tenant_webbskap_config").upsert({ tenant_id: tenant.id, ...wb });
    const b = await supabase.from("tenant_postnord_config").upsert({ tenant_id: tenant.id, ...pn });
    setSaving(false);
    if (a.error || b.error) toast.error("Kunde inte spara");
    else toast.success("Sparat");
  };

  const saveSubdomain = async () => {
    const cleaned = subdomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\.webbskap\.se.*$/, "")
      .replace(/\/.*$/, "");
    if (!cleaned) { toast.error("Ange din subdomän"); return; }
    if (!/^[a-z0-9-]+$/.test(cleaned)) {
      toast.error("Subdomänen får bara innehålla bokstäver, siffror och bindestreck");
      return;
    }
    setSavingSubdomain(true);
    const { error } = await supabase.from("tenants").update({ subdomain: cleaned }).eq("id", tenant.id);
    setSavingSubdomain(false);
    if (error) {
      toast.error("Kunde inte spara subdomänen");
    } else {
      setSubdomain(cleaned);
      toast.success("Subdomän sparad");
      onTenantUpdated?.();
    }
  };

  const validateCustomerNumber = async () => {
    if (!pn.customer_number) {
      toast.error("Fyll i kundnummer först");
      return;
    }
    setValidating(true);
    setCnValid(null);
    const { data, error } = await supabase.functions.invoke("validate-customer-number", {
      body: {
        customer_number: pn.customer_number,
        country_code: pn.sender_country,
        api_key: pn.api_key || undefined,
        environment: pn.environment,
      },
    });
    setValidating(false);
    if (error) { toast.error("Validering misslyckades: " + error.message); return; }
    setCnValid(!!data?.valid);
    if (data?.valid) toast.success("Kundnummer giltigt");
    else toast.error(`Kundnummer kunde inte verifieras (status ${data?.status ?? "?"})`);
  };

  const prefillFromWebbskap = async () => {
    setPrefilling(true);
    const { data, error } = await supabase.functions.invoke("webbskap-site-info", {
      body: { tenant_id: tenant.id },
    });
    setPrefilling(false);
    if (error || !data?.site) {
      toast.error("Kunde inte hämta info från Webbskap");
      return;
    }
    const s = data.site as any;
    setPn((prev) => ({
      ...prev,
      sender_company: prev.sender_company || s.companyName || s.name || "",
      sender_name: prev.sender_name || s.contactName || s.ownerName || "",
      sender_email: prev.sender_email || s.email || "",
      sender_phone: prev.sender_phone || s.phone || "",
      sender_address: prev.sender_address || s.address || s.street || "",
      sender_zip: prev.sender_zip || s.zipCode || s.postalCode || "",
      sender_city: prev.sender_city || s.city || "",
      sender_country: prev.sender_country || (s.country ?? "SE"),
    }));
    setAdvancedOpen(true);
    toast.success("Avsändare ifylld från Webbskap");
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest/${tenant.id}`;

  const ready = {
    subdomain: !!tenant.subdomain,
    postnord: !!(pn.customer_number && (pn.api_key || pn.environment === "sandbox")),
    webhook: !!wb.webhook_secret,
    sender: !!(pn.sender_address && pn.sender_zip && pn.sender_city),
    receivedEvent: !!lastEvent,
  };
  const allReady = ready.subdomain && ready.postnord && ready.webhook && ready.sender;

  return (
    <div className="space-y-6 max-w-3xl">
      {userId && <BillingSection userId={userId} />}

      {/* Status */}
      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Setup-status</h2>
          {allReady ? (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Redo att boka</span>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Pågående</span>
          )}
        </div>
        <div className="space-y-1.5">
          <StatusRow ok={ready.subdomain} label="Webbskap-subdomän" hint="Krävs för att uppdatera ordrar tillbaka till din butik" />
          <StatusRow ok={ready.postnord} label="PostNord API-nyckel & kundnummer" hint="Krävs för att boka frakt" />
          <StatusRow ok={ready.webhook} label="Webhook secret från Webbskap" hint="Krävs för att ta emot ordrar" />
          <StatusRow ok={ready.sender} label="Avsändaradress" hint="Klicka 'Hämta från Webbskap' nedan" />
          <StatusRow
            ok={ready.receivedEvent}
            label={lastEvent
              ? `Senaste event: ${lastEvent.topic} (${new Date(lastEvent.received_at).toLocaleString("sv-SE")}${lastEvent.verified ? "" : " – ej verifierat"})`
              : "Ingen webhook mottagen ännu"}
            hint="Vi listar här när första ordern kommer in"
          />
        </div>
      </Card>

      {/* Webbskap-sajt */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Din Webbskap-sajt</h2>
          <p className="text-sm text-muted-foreground">
            Ange subdomänen för din butik. Den används för att uppdatera ordrar tillbaka till Webbskap
            (status, spårningsnummer) när du bokat en frakt.
          </p>
        </div>
        <div>
          <Label>Subdomän</Label>
          <div className="flex items-center gap-2">
            <Input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="din-butik"
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">.webbskap.se</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            T.ex. om din butik finns på <code>min-butik.webbskap.se</code>, skriv <code>min-butik</code>.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={saveSubdomain} disabled={savingSubdomain}>
          {savingSubdomain ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Spara subdomän
        </Button>
      </Card>

      {/* PostNord */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">PostNord-uppgifter</h2>
          <p className="text-sm text-muted-foreground">
            Hämta dessa från ditt PostNord-avtal. Detta är allt vi behöver för att börja boka frakt.
          </p>
        </div>

        <div>
          <Label>Miljö</Label>
          <div className="flex gap-2 mt-1">
            <Button
              type="button"
              size="sm"
              variant={pn.environment === "sandbox" ? "default" : "outline"}
              onClick={() => { setPn({ ...pn, environment: "sandbox" }); setCnValid(null); }}
            >
              Sandbox (test)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pn.environment === "live" ? "default" : "outline"}
              onClick={() => { setPn({ ...pn, environment: "live" }); setCnValid(null); }}
            >
              Live (skarpt)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Använd <strong>Sandbox</strong> för att testa hela flödet utan att boka riktiga försändelser.
            Du kan lämna API-nyckeln tom för att använda vår gemensamma sandbox-nyckel.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>API-nyckel {pn.environment === "sandbox" && <span className="text-xs text-muted-foreground">(valfri i sandbox)</span>}</Label>
            <Input value={pn.api_key} onChange={(e) => { setPn({ ...pn, api_key: e.target.value }); setCnValid(null); }} placeholder={pn.environment === "sandbox" ? "Lämna tom för att använda vår sandbox-nyckel" : "Klistra in från PostNord"} />
          </div>
          <div>
            <Label>Kundnummer</Label>
            <Input value={pn.customer_number} onChange={(e) => { setPn({ ...pn, customer_number: e.target.value }); setCnValid(null); }} placeholder="t.ex. 1234567" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={validateCustomerNumber} disabled={validating}>
            {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Validera kundnummer mot PostNord
          </Button>
          {cnValid === true && <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Giltigt</span>}
          {cnValid === false && <span className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Hittades ej</span>}
        </div>
      </Card>

      {/* Webhook */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Webhook från Webbskap</h2>
          <p className="text-sm text-muted-foreground">
            I Webbskap → Inställningar → Applications → skapa en webhook för "Ny order". Kopiera URL:en nedan
            och klistra in i Webbskap. Klistra sedan in den secret Webbskap genererar här.
          </p>
        </div>
        <CopyField label="Webhook URL (klistra in hos Webbskap)" value={webhookUrl} />
        <div>
          <Label>Webhook secret (från Webbskap)</Label>
          <Input
            value={wb.webhook_secret}
            onChange={(e) => setWb({ ...wb, webhook_secret: e.target.value })}
            placeholder="Klistra in secret som Webbskap visade"
          />
        </div>
      </Card>

      {/* Avancerat */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Card className="p-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            <div className="text-left">
              <h2 className="text-lg font-semibold">Avancerat</h2>
              <p className="text-sm text-muted-foreground">
                Avsändaradress, service-kod och Website API-key. Hämtas automatiskt om möjligt.
              </p>
            </div>
            <ChevronDown className={`h-5 w-5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={prefillFromWebbskap} disabled={prefilling}>
              {prefilling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Hämta avsändare från Webbskap
            </Button>

            <div>
              <Label>Website API-key (Webbskap)</Label>
              <Input
                value={wb.website_api_key}
                onChange={(e) => setWb({ ...wb, website_api_key: e.target.value })}
                placeholder="Valfri – behövs bara om plattformsnyckel saknas"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Vi använder en gemensam plattformsnyckel hos Webbskap automatiskt. Fyll bara i detta om du vill köra mot ditt eget API-konto.
              </p>
            </div>
            <div>
              <Label>Default service code</Label>
              <Input value={pn.default_service_code} onChange={(e) => setPn({ ...pn, default_service_code: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">17 = Mypack Home, 18 = Parcel, 19 = Mypack Collect</p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Avsändare</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Företag</Label>
                  <Input value={pn.sender_company} onChange={(e) => setPn({ ...pn, sender_company: e.target.value })} /></div>
                <div><Label>Kontaktperson</Label>
                  <Input value={pn.sender_name} onChange={(e) => setPn({ ...pn, sender_name: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Adress</Label>
                  <Input value={pn.sender_address} onChange={(e) => setPn({ ...pn, sender_address: e.target.value })} /></div>
                <div><Label>Postnummer</Label>
                  <Input value={pn.sender_zip} onChange={(e) => setPn({ ...pn, sender_zip: e.target.value })} /></div>
                <div><Label>Ort</Label>
                  <Input value={pn.sender_city} onChange={(e) => setPn({ ...pn, sender_city: e.target.value })} /></div>
                <div><Label>Land</Label>
                  <Input value={pn.sender_country} onChange={(e) => setPn({ ...pn, sender_country: e.target.value })} /></div>
                <div><Label>Telefon</Label>
                  <Input value={pn.sender_phone} onChange={(e) => setPn({ ...pn, sender_phone: e.target.value })} /></div>
                <div><Label>E-post</Label>
                  <Input value={pn.sender_email} onChange={(e) => setPn({ ...pn, sender_email: e.target.value })} /></div>
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Button onClick={save} disabled={saving}>{saving ? "Sparar…" : "Spara inställningar"}</Button>
    </div>
  );
}
