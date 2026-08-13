-- Bank-stability 3.0
-- Совместимость с текущей админ-панелью: она сортирует кредиты по created_at.
-- Безопасно для БД, где колонка уже существует.

ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.credits
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

ALTER TABLE public.credits
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.credits
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credits_created_at
  ON public.credits (created_at DESC);
