import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Search, Loader2 } from "lucide-react";

export interface ServicePoint {
  id: string;
  name: string;
  delivery_address: {
    streetName?: string;
    streetNumber?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
  };
  visiting_address?: any;
  distance: number | null;
  opening_hours: Array<{ openDay: string; openTime: string; closeTime: string }>;
  type: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Recipient address — used to find nearest service points. */
  recipient: {
    postalCode: string;
    countryCode: string;
    city?: string;
    streetName?: string;
    streetNumber?: string;
  };
  /** Currently selected service point id (highlighted in list). */
  selectedId?: string | null;
  onPicked: (sp: ServicePoint | null) => void;
}

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT_SV: Record<string, string> = {
  Monday: "Mån", Tuesday: "Tis", Wednesday: "Ons", Thursday: "Tors",
  Friday: "Fre", Saturday: "Lör", Sunday: "Sön",
};

function formatHours(hours: ServicePoint["opening_hours"]): string {
  if (!hours?.length) return "—";
  const byDay = new Map<string, string>();
  for (const h of hours) byDay.set(h.openDay, `${h.openTime}–${h.closeTime}`);
  return DAY_ORDER
    .filter((d) => byDay.has(d))
    .map((d) => `${DAY_SHORT_SV[d]} ${byDay.get(d)}`)
    .join(" · ");
}

function formatAddress(a: ServicePoint["delivery_address"]): string {
  if (!a) return "";
  const street = [a.streetName, a.streetNumber].filter(Boolean).join(" ");
  return [street, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function ServicePointPicker({ open, onOpenChange, recipient, selectedId, onPicked }: Props) {
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<ServicePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!recipient.postalCode) {
      setError("Mottagarens postnummer saknas.");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: invErr } = await supabase.functions.invoke("find-service-points", {
      body: recipient,
    });
    setLoading(false);
    const res = data as any;
    if (invErr || res?.error) {
      setError(res?.error ?? invErr?.message ?? "Kunde inte hämta utlämningsställen");
      setPoints([]);
      return;
    }
    setPoints(res?.servicePoints ?? []);
  };

  // Auto-search when modal opens
  useEffect(() => {
    if (open) {
      setPoints([]);
      setError(null);
      search();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (sp: ServicePoint) => {
    onPicked(sp);
    onOpenChange(false);
    toast.success(`Valt utlämningsställe: ${sp.name}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Välj utlämningsställe
          </DialogTitle>
          <DialogDescription>
            Närmaste PostNord-ombud för {recipient.postalCode} {recipient.city ?? ""}, {recipient.countryCode}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Söker utlämningsställen…
            </div>
          )}
          {error && !loading && (
            <Card className="p-4 text-sm">
              <div className="text-destructive">{error}</div>
              <Button size="sm" variant="outline" onClick={search} className="mt-2">
                <Search className="h-3 w-3 mr-1.5" /> Försök igen
              </Button>
            </Card>
          )}
          {!loading && !error && points.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Inga utlämningsställen hittades för det postnumret.
            </Card>
          )}
          {!loading && points.map((sp) => (
            <Card
              key={sp.id}
              className={`p-3 cursor-pointer transition-colors hover:bg-accent ${
                selectedId === sp.id ? "border-primary bg-accent" : ""
              }`}
              onClick={() => pick(sp)}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{sp.name}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {formatAddress(sp.delivery_address)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {formatHours(sp.opening_hours)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {sp.distance != null && (
                    <Badge variant="outline" className="text-xs">{Math.round(sp.distance)} m</Badge>
                  )}
                  {selectedId === sp.id && <Badge>Valt</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <DialogFooter className="gap-2">
          {selectedId && (
            <Button variant="ghost" onClick={() => { onPicked(null); onOpenChange(false); }}>
              Ta bort val
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Stäng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
