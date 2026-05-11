import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, Truck } from "lucide-react";

export interface PickupModalDefaults {
  /** YYYY-MM-DD. If absent, defaults to next workday. */
  pickup_date?: string;
  pickup_type?: "p1" | "p2";
  instruction?: string;
  parcels?: number;
  total_weight_kg?: number;
  reference?: string;
  // Pickup address — defaults to tenant config server-side if absent here
  pickup_name?: string;
  pickup_company?: string;
  pickup_address?: string;
  pickup_zip?: string;
  pickup_city?: string;
  pickup_country?: string;
  pickup_phone?: string;
  pickup_email?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** If set, the pickup is linked to this shipment server-side. */
  shipmentId?: string | null;
  defaults?: PickupModalDefaults;
  onBooked?: () => void;
}

function nextWorkday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Skip Saturday (6) and Sunday (0)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function PickupModal({ open, onOpenChange, shipmentId, defaults, onBooked }: Props) {
  const [date, setDate] = useState(defaults?.pickup_date ?? nextWorkday());
  const [type, setType] = useState<"p1" | "p2">(defaults?.pickup_type ?? "p2");
  const [instruction, setInstruction] = useState(defaults?.instruction ?? "");
  const [parcels, setParcels] = useState(String(defaults?.parcels ?? 1));
  const [weight, setWeight] = useState(String(defaults?.total_weight_kg ?? ""));
  const [reference, setReference] = useState(defaults?.reference ?? "");
  const [busy, setBusy] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);

  // Optional address overrides
  const [name, setName] = useState(defaults?.pickup_name ?? "");
  const [company, setCompany] = useState(defaults?.pickup_company ?? "");
  const [address, setAddress] = useState(defaults?.pickup_address ?? "");
  const [zip, setZip] = useState(defaults?.pickup_zip ?? "");
  const [city, setCity] = useState(defaults?.pickup_city ?? "");
  const [country, setCountry] = useState(defaults?.pickup_country ?? "SE");
  const [phone, setPhone] = useState(defaults?.pickup_phone ?? "");
  const [email, setEmail] = useState(defaults?.pickup_email ?? "");

  // Re-seed when modal re-opens for a new context
  useEffect(() => {
    if (!open) return;
    setDate(defaults?.pickup_date ?? nextWorkday());
    setType(defaults?.pickup_type ?? "p2");
    setInstruction(defaults?.instruction ?? "");
    setParcels(String(defaults?.parcels ?? 1));
    setWeight(String(defaults?.total_weight_kg ?? ""));
    setReference(defaults?.reference ?? "");
    setName(defaults?.pickup_name ?? "");
    setCompany(defaults?.pickup_company ?? "");
    setAddress(defaults?.pickup_address ?? "");
    setZip(defaults?.pickup_zip ?? "");
    setCity(defaults?.pickup_city ?? "");
    setCountry(defaults?.pickup_country ?? "SE");
    setPhone(defaults?.pickup_phone ?? "");
    setEmail(defaults?.pickup_email ?? "");
    setAddrOpen(false);
  }, [open, defaults]);

  const submit = async () => {
    if (!instruction.trim()) {
      toast.error("Skriv en upphämtningsinstruktion (t.ex. 'Kollin står utanför grinden')");
      return;
    }
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      toast.error("Ange total vikt större än 0 kg");
      return;
    }
    const p = Math.max(1, Math.floor(Number(parcels) || 1));

    setBusy(true);
    const body: any = {
      pickup_date: date,
      pickup_type: type,
      instruction: instruction.trim(),
      parcels: p,
      total_weight_kg: w,
      reference: reference.trim() || undefined,
    };
    if (shipmentId) body.shipment_id = shipmentId;
    // Address overrides — only send if user actually typed something
    if (name.trim()) body.pickup_name = name.trim();
    if (company.trim()) body.pickup_company = company.trim();
    if (address.trim()) body.pickup_address = address.trim();
    if (zip.trim()) body.pickup_zip = zip.trim();
    if (city.trim()) body.pickup_city = city.trim();
    if (country.trim()) body.pickup_country = country.trim().toUpperCase();
    if (phone.trim()) body.pickup_phone = phone.trim();
    if (email.trim()) body.pickup_email = email.trim();

    const { data, error } = await supabase.functions.invoke("book-pickup", { body });
    setBusy(false);

    const res = data as any;
    if (error || res?.error) {
      toast.error(res?.message ?? res?.details ?? res?.error ?? error?.message ?? "Bokning misslyckades");
      return;
    }
    toast.success("Upphämtning bokad hos PostNord!");
    onOpenChange(false);
    onBooked?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Boka upphämtning
          </DialogTitle>
          <DialogDescription>
            PostNord hämtar paketen på angiven dag. Du behöver inte boka upphämtning om du redan har en
            återkommande rutt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-date">Upphämtningsdag</Label>
              <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-type">Typ av adress</Label>
              <Select value={type} onValueChange={(v: "p1" | "p2") => setType(v)}>
                <SelectTrigger id="p-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="p2">Privatadress (p2)</SelectItem>
                  <SelectItem value="p1">Företagsadress (p1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="p-instruction">Upphämtningsinstruktion</Label>
            <Textarea
              id="p-instruction"
              placeholder="T.ex. 'Kollin står utanför entrén' eller 'Ring vid ankomst'"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-parcels">Antal kollin</Label>
              <Input id="p-parcels" type="number" min={1} value={parcels} onChange={(e) => setParcels(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-weight">Total vikt (kg)</Label>
              <Input id="p-weight" type="number" min={0} step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="p-ref">Referens (frivilligt)</Label>
            <Input id="p-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="t.ex. ordernummer" />
          </div>

          <Collapsible open={addrOpen} onOpenChange={setAddrOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-4 w-4 transition-transform ${addrOpen ? "rotate-180" : ""}`} />
                Avvikande upphämtningsadress
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <Card className="p-3 space-y-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Lämna tomt för att använda din standardadress från Inställningar.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="p-name" className="text-xs">Namn</Label>
                    <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="p-company" className="text-xs">Företag</Label>
                    <Input id="p-company" value={company} onChange={(e) => setCompany(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="p-addr" className="text-xs">Adress</Label>
                  <Input id="p-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="p-zip" className="text-xs">Postnr</Label>
                    <Input id="p-zip" value={zip} onChange={(e) => setZip(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="p-city" className="text-xs">Ort</Label>
                    <Input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="p-country" className="text-xs">Land</Label>
                    <Input id="p-country" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="p-phone" className="text-xs">Telefon</Label>
                    <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="p-email" className="text-xs">E-post</Label>
                    <Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Bokar…" : "Boka upphämtning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
