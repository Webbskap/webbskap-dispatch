import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Search, Loader2, Clock } from "lucide-react";

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
const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};
const DAY_SHORT_SV: Record<string, string> = {
  Monday: "Mån", Tuesday: "Tis", Wednesday: "Ons", Thursday: "Tors",
  Friday: "Fre", Saturday: "Lör", Sunday: "Sön",
};

function formatDistance(m: number | null): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  if (m < 1000) return `${Math.round(m)} m`;
  // 1.0–9.9 km with one decimal, 10+ km rounded
  return m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}

function formatAddress(a: ServicePoint["delivery_address"]): string {
  if (!a) return "";
  const street = [a.streetName, a.streetNumber].filter(Boolean).join(" ");
  return [street, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** "HH:MM" -> minutes since midnight */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Today's open-status summary, e.g.:
 *   "Öppet · Stänger 20:00"
 *   "Stängt · Öppnar 08:00 i morgon"
 *   "Stängt idag · Öppnar mån 07:00"
 */
function todayStatus(hours: ServicePoint["opening_hours"]): { label: string; isOpen: boolean } {
  if (!hours?.length) return { label: "Öppettider okända", isOpen: false };
  const now = new Date();
  const todayIdx = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayName = Object.keys(DAY_INDEX).find((k) => DAY_INDEX[k] === todayIdx);
  const today = todayName ? hours.find((h) => h.openDay === todayName) : undefined;

  if (today) {
    const open = toMinutes(today.openTime);
    const close = toMinutes(today.closeTime);
    if (nowMin >= open && nowMin < close) {
      return { label: `Öppet · Stänger ${today.closeTime}`, isOpen: true };
    }
    if (nowMin < open) {
      return { label: `Stängt · Öppnar ${today.openTime}`, isOpen: false };
    }
  }
  // Find next open day (look forward up to 7 days)
  for (let i = 1; i <= 7; i++) {
    const idx = (todayIdx + i) % 7;
    const name = Object.keys(DAY_INDEX).find((k) => DAY_INDEX[k] === idx);
    const day = name ? hours.find((h) => h.openDay === name) : undefined;
    if (day) {
      const when = i === 1 ? "i morgon" : DAY_SHORT_SV[name!];
      return { label: `Stängt · Öppnar ${day.openTime} ${when}`, isOpen: false };
    }
  }
  return { label: "Stängt", isOpen: false };
}

export function ServicePointPicker({ open, onOpenChange, recipient, selectedId, onPicked }: Props) {
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<ServicePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [postalCode, setPostalCode] = useState(recipient.postalCode ?? "");
  const [city, setCity] = useState(recipient.city ?? "");
  const [streetName, setStreetName] = useState(recipient.streetName ?? "");
  const [streetNumber, setStreetNumber] = useState(recipient.streetNumber ?? "");

  const search = async (
    overrides?: { zip?: string; city?: string; street?: string; number?: string },
  ) => {
    const zip = (overrides?.zip ?? postalCode ?? "").trim();
    if (!zip) {
      setError("Ange ett postnummer för att söka utlämningsställen.");
      setPoints([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: invErr } = await supabase.functions.invoke("find-service-points", {
      body: {
        postalCode: zip,
        countryCode: recipient.countryCode,
        city: (overrides?.city ?? city) || undefined,
        streetName: (overrides?.street ?? streetName) || undefined,
        streetNumber: (overrides?.number ?? streetNumber) || undefined,
      },
    });
    setLoading(false);
    const res = data as any;
    if (invErr || res?.error) {
      setError(res?.error ?? invErr?.message ?? "Kunde inte hämta utlämningsställen");
      setPoints([]);
      return;
    }
    const list: ServicePoint[] = res?.servicePoints ?? [];
    list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    setPoints(list);
  };

  // Auto-search when modal opens (or reset state)
  useEffect(() => {
    if (open) {
      const initialZip = recipient.postalCode ?? "";
      const initialCity = recipient.city ?? "";
      const initialStreet = recipient.streetName ?? "";
      const initialNumber = recipient.streetNumber ?? "";
      setPostalCode(initialZip);
      setCity(initialCity);
      setStreetName(initialStreet);
      setStreetNumber(initialNumber);
      setPoints([]);
      setError(null);
      if (initialZip.trim()) {
        search({ zip: initialZip, city: initialCity, street: initialStreet, number: initialNumber });
      } else {
        setError("Mottagarens postnummer saknas. Ange ett postnummer nedan.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const recipientSummary = useMemo(() => {
    const street = [recipient.streetName, recipient.streetNumber].filter(Boolean).join(" ");
    return [street, [recipient.postalCode, recipient.city].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
  }, [recipient]);

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
            {recipientSummary
              ? <>Närmaste PostNord-ombud för <span className="font-medium">{recipientSummary}</span>. Justera adressen nedan om något är fel.</>
              : "Ange mottagarens adress för att hitta närmaste ombud."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); search(); }}
          className="space-y-2 border-b pb-3"
        >
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Gata</label>
              <input
                value={streetName}
                onChange={(e) => setStreetName(e.target.value)}
                placeholder="Storgatan"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nr</label>
              <input
                value={streetNumber}
                onChange={(e) => setStreetNumber(e.target.value)}
                placeholder="12"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-[120px_1fr_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Postnummer</label>
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="111 22"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ort</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Stockholm"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <Button type="submit" size="sm" disabled={loading}>
              <Search className="h-3 w-3 mr-1.5" /> Sök
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ju mer komplett adress, desto noggrannare avstånd.
          </p>
        </form>

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
            </Card>
          )}
          {!loading && !error && points.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Inga utlämningsställen hittades för det postnumret.
            </Card>
          )}
          {!loading && points.map((sp) => {
            const status = todayStatus(sp.opening_hours);
            const dist = formatDistance(sp.distance);
            const isSelected = selectedId === sp.id;
            return (
              <Card
                key={sp.id}
                className={`p-3 cursor-pointer transition-colors hover:bg-accent ${
                  isSelected ? "border-primary bg-accent" : ""
                }`}
                onClick={() => pick(sp)}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{sp.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {formatAddress(sp.delivery_address)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-1.5">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className={status.isOpen ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {dist && <Badge variant="outline" className="text-xs">{dist}</Badge>}
                    {isSelected && <Badge>Valt</Badge>}
                  </div>
                </div>
              </Card>
            );
          })}
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

/**
 * Compact opening-hours table for use inline in the order detail view
 * (showing the full week for the chosen service point).
 */
export function ServicePointHoursTable({
  hours,
}: {
  hours: ServicePoint["opening_hours"];
}) {
  if (!hours?.length) return <span className="text-xs text-muted-foreground">Öppettider okända</span>;
  const byDay = new Map<string, string>();
  for (const h of hours) byDay.set(h.openDay, `${h.openTime}–${h.closeTime}`);
  const todayIdx = new Date().getDay();
  return (
    <div className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {DAY_ORDER.map((d) => {
        const isToday = DAY_INDEX[d] === todayIdx;
        return (
          <div key={d} className="contents">
            <div className={isToday ? "font-medium" : "text-muted-foreground"}>
              {DAY_SHORT_SV[d]}{isToday ? " (idag)" : ""}
            </div>
            <div className={isToday ? "font-medium" : "text-muted-foreground"}>
              {byDay.get(d) ?? "Stängt"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
