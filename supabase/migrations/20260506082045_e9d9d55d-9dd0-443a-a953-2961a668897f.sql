ALTER TABLE public.tenant_postnord_config
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live'));

-- api_key per tenant blir frivilligt — Partner-modellen använder global POSTNORD_API_KEY secret.
-- Behåll kolumnen för bakåtkompatibilitet men gör den frivillig (är redan nullable).
COMMENT ON COLUMN public.tenant_postnord_config.api_key IS
  'Frivilligt. Partner-integrationer använder global POSTNORD_API_KEY secret istället. Lämna tomt för att använda Partner-nyckeln.';