import { useEffect, useState } from "react";
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
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Iframe handshake
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const eid = params.get("eid");
      const ts = params.get("ts");
      const sig = params.get("sig");

      if (eid && ts && sig && !session) {
        try {
          const r = await fetch(
            `https://olavdstyfkyoctgtssjk.supabase.co/functions/v1/iframe-auth?${params.toString()}`,
            { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
          );
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error ?? "auth_failed");
          // Use email + hashed_token to verify OTP and create session
          const { error: vErr } = await supabase.auth.verifyOtp({
            type: "magiclink",
            email: j.email,
            token_hash: j.hashed_token,
          } as any);
          if (vErr) throw vErr;
          // Clean URL
          window.history.replaceState({}, "", window.location.pathname);
        } catch (e: any) {
          setError(e?.message ?? "Auth failed");
        }
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line

  // Resolve tenant
  useEffect(() => {
    if (!session) { setTenant(null); return; }
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("tenant_id, tenants:tenant_id (id, display_name, subdomain, external_customer_id, website_id)")
        .limit(1)
        .maybeSingle();
      const t = (data as any)?.tenants;
      if (t) setTenant(t);
    })();
  }, [session]);

  return { session, tenant, loading, error };
}
