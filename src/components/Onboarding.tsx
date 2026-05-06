import { Tenant } from "@/hooks/useAuthAndTenant";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BillingSection } from "@/components/BillingSection";

export function Onboarding({ tenant, userId }: { tenant: Tenant; userId?: string }) {
  const [wb, setWb] = useState({ website_api_key: "", webhook_secret: "" });
  const [pn, setPn] = useState({
    api_key: "", customer_number: "", default_service_code: "17",
    sender_name: "", sender_company: "", sender_address: "",
    sender_zip: "", sender_city: "", sender_country: "SE",
    sender_phone: "", sender_email: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: w }, { data: p }] = await Promise.all([
        supabase.from("tenant_webbskap_config").select("*").eq("tenant_id", tenant.id).maybeSingle(),
        supabase.from("tenant_postnord_config").select("*").eq("tenant_id", tenant.id).maybeSingle(),
      ]);
      if (w) setWb({ website_api_key: w.website_api_key ?? "", webhook_secret: w.webhook_secret ?? "" });
      if (p) setPn({ ...pn, ...p });
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
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">1. Webbskap-koppling</h2>
        <p className="text-sm text-muted-foreground">
          Gå till din Webbskap-sajt → Inställningar → Applications. Skapa en webhook med URL och secret nedan,
          och kopiera Website API-key.
        </p>
        <div className="space-y-1">
          <Label>Webhook URL (klistra in hos Webbskap)</Label>
          <Input readOnly value={webhookUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Website API-key</Label>
            <Input value={wb.website_api_key} onChange={(e) => setWb({ ...wb, website_api_key: e.target.value })} /></div>
          <div><Label>Webhook secret</Label>
            <Input value={wb.webhook_secret} onChange={(e) => setWb({ ...wb, webhook_secret: e.target.value })} /></div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">2. PostNord-uppgifter</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>API-nyckel</Label>
            <Input value={pn.api_key} onChange={(e) => setPn({ ...pn, api_key: e.target.value })} /></div>
          <div><Label>Kundnummer</Label>
            <Input value={pn.customer_number} onChange={(e) => setPn({ ...pn, customer_number: e.target.value })} /></div>
          <div><Label>Default service code</Label>
            <Input value={pn.default_service_code} onChange={(e) => setPn({ ...pn, default_service_code: e.target.value })} /></div>
        </div>
        <h3 className="text-sm font-medium mt-2">Avsändare</h3>
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
      </Card>

      <Button onClick={save} disabled={saving}>{saving ? "Sparar…" : "Spara inställningar"}</Button>
    </div>
  );
}
