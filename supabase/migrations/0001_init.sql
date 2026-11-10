-- Cloud storage for the closet. The cloud is the only store: pieces, looks, wear history
-- and preferences all live here, and the app keeps nothing on the device except a cache.
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Everything is one table of JSON records keyed by (user, kind, id), so adding a field
-- to a piece or look never needs a migration.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('item', 'outfit', 'wear_event', 'plan', 'feedback', 'preference')),
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create or replace function public.touch_record() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.touch_record();

alter table public.records enable row level security;

drop policy if exists "own records: read" on public.records;
create policy "own records: read" on public.records
  for select using (user_id = auth.uid());

drop policy if exists "own records: insert" on public.records;
create policy "own records: insert" on public.records
  for insert with check (user_id = auth.uid());

drop policy if exists "own records: update" on public.records;
create policy "own records: update" on public.records
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own records: delete" on public.records;
create policy "own records: delete" on public.records
  for delete using (user_id = auth.uid());

-- Private bucket for piece photos. Each user can only touch files under their own id folder.
insert into storage.buckets (id, name, public)
values ('closet-images', 'closet-images', false)
on conflict (id) do nothing;

drop policy if exists "own images: read" on storage.objects;
create policy "own images: read" on storage.objects
  for select using (bucket_id = 'closet-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own images: insert" on storage.objects;
create policy "own images: insert" on storage.objects
  for insert with check (bucket_id = 'closet-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own images: update" on storage.objects;
create policy "own images: update" on storage.objects
  for update using (bucket_id = 'closet-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own images: delete" on storage.objects;
create policy "own images: delete" on storage.objects
  for delete using (bucket_id = 'closet-images' and (storage.foldername(name))[1] = auth.uid()::text);
