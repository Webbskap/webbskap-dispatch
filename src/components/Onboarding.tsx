import { Tenant } from "@/hooks/useAuthAndTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BillingSection } from "@/components/BillingSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Copy, Check } from "lucide-react";

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

export function Onboarding({ tenant, userId }: { tenant: Tenant; userId?: string }) {
  const [wb, setWb] = useState({ website_api_key: "", webhook_secret: "" });
  const [pn, setPn] = useState({
    api_key: "", customer_number: "", default_service_code: "17",
    sender_name: "", sender_company: "", sender_address: "",
    sender_zip: "", sender_city: "", sender_country: "SE",
    sender_phone: "", sender_email: "",
  });
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: w }, { data: p }] = await Promise.all([
        supabase.from("tenant_webbskap_config").select("*").eq("tenant_id", tenant.id).maybeSingle(),
        supabase.from("tenant_postnord_config").select("*").eq("tenant_id", tenant.id).maybeSingle(),
      ]);
      if (w) setWb({ website_api_key: w.website_api_key ?? "", webhook_secret: w.webhook_secret ?? "" });
      if (p) setPn((prev) => ({ ...prev, ...p }));
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

  const webhookUrl = `https://olavdstyfkyoctgtssjk.supabase.co/functions/v1/webhook-ingest/${tenant.id}`;

  return (
    <div className="space-y-6 max-w-3xl">
      {userId && <BillingSection userId={userId} />}

      {/* STEG 1: Det enda kunden måste mata in */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">PostNord-uppgifter</h2>
          <p className="text-sm text-muted-foreground">
            Hämta dessa från ditt PostNord-avtal. Detta är allt vi behöver för att börja boka frakt.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>API-nyckel</Label>
            <Input value={pn.api_key} onChange={(e) => setPn({ ...pn, api_key: e.target.value })} placeholder="Klistra in från PostNord" />
          </div>
          <div>
            <Label>Kundnummer</Label>
            <Input value={pn.customer_number} onChange={(e) => setPn({ ...pn, customer_number: e.target.value })} placeholder="t.ex. 1234567" />
          </div>
        </div>
      </Card>

      {/* STEG 2: Webhook-koppling till Webbskap */}
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
        <div>
          <Label>Webbskap Project-ID</Label>
          <Input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Hittas i Webbskap-projektets inställningar"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Används för att verifiera att inkommande ordrar tillhör rätt projekt.
          </p>
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
            <div>
              <Label>Website API-key (Webbskap)</Label>
              <Input
                value={wb.website_api_key}
                onChange={(e) => setWb({ ...wb, website_api_key: e.target.value })}
                placeholder="Behövs för att skicka tracking tillbaka till Webbskap"
              />
            </div>
            <div>
              <Label>Default service code</Label>
              <Input value={pn.default_service_code} onChange={(e) => setPn({ ...pn, default_service_code: e.target.value })} />
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
