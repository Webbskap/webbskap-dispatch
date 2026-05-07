import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

export type Tenant = {
  id: string;
  display_name: string | null;
  subdomain: string | null;
  external_customer_id: string;
  website_id: string | null;
};

export function useAuthAndTenant() {
  const [session, setSession] = useState<Session | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadTenant = useCallback(async (signal?: { cancelled: boolean }) => {
    const { data } = await supabase
      .from("user_roles")
      .select("tenant_id, tenants:tenant_id (id, display_name, subdomain, external_customer_id, website_id)")
      .limit(1)
      .maybeSingle();
    let t = (data as any)?.tenants;
    if (!t) {
      const { data: prov, error: pErr } = await supabase.functions.invoke("provision-tenant");
      if (pErr) {
        if (!signal?.cancelled) setError(pErr.message);
        return;
      }
      t = (prov as any)?.tenant;
    }
    if (!signal?.cancelled && t) setTenant(t);
  }, []);

  useEffect(() => {
    if (!session) { setTenant(null); return; }
    const signal = { cancelled: false };
    loadTenant(signal);
    return () => { signal.cancelled = true; };
  }, [session, loadTenant]);

  const refetchTenant = useCallback(() => loadTenant(), [loadTenant]);

  return { session, tenant, loading, error, refetchTenant };
}
