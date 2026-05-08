ALTER TABLE public.tenant_postnord_config
  ADD COLUMN IF NOT EXISTS default_label_format text NOT NULL DEFAULT 'A4'
  CHECK (default_label_format IN ('A4','A5','A6'));