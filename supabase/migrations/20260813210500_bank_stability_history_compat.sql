-- Compatibility repair for older Bank-stability databases.
alter table if exists public.transactions add column if not exists created_at timestamptz default now();
update public.transactions set created_at=now() where created_at is null;
alter table if exists public.fines add column if not exists created_at timestamptz default now();
alter table if exists public.fines add column if not exists title text;
update public.fines set title=coalesce(nullif(title,''),reason,'Штраф') where title is null or btrim(title)='';
create index if not exists transactions_created_at_idx on public.transactions(created_at desc);
create index if not exists fines_created_at_idx on public.fines(created_at desc);
notify pgrst,'reload schema';