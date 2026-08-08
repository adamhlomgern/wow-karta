-- Kör detta EN gång i Supabase → SQL Editor → New query → Run.
--
-- Har du redan kört ett äldre schema (utan bekvämlighets-fälten)? Kör bara
-- migreringen längst ner i filen istället — den lägger bara till de nya
-- kolumnerna utan att röra befintlig data.

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dest_lat double precision not null,
  dest_lon double precision not null,
  dest_label text not null,
  created_at timestamptz not null default now()
);

create table places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  type text not null default 'fricamping',
  status text not null default 'Idé',
  price numeric,
  link text,
  notes text,
  near_toilet boolean default false,
  near_badplats boolean default false,
  near_rastplats boolean default false,
  has_shower boolean default false,
  has_wifi boolean default false,
  has_power boolean default false,
  pets_allowed boolean default false,
  has_kitchen boolean default false,
  is_favorite boolean default false,
  capacity integer,
  lat double precision not null,
  lon double precision not null,
  order_index integer,
  distance_km double precision,
  duration_min double precision,
  created_at timestamptz not null default now()
);

alter table trips enable row level security;
alter table places enable row level security;

create policy "own trips" on trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "places in own trips" on places
  for all using (exists (select 1 from trips where trips.id = places.trip_id and trips.user_id = auth.uid()))
  with check (exists (select 1 from trips where trips.id = places.trip_id and trips.user_id = auth.uid()));

-- RLS-policyerna ovan styr VILKA rader en användare får se/ändra, men Postgres
-- kräver separata GRANT-satser för att tillåta rollen att fråga tabellen alls.
-- Utan dessa får inloggade användare "permission denied" trots korrekta RLS-policyer.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.places to authenticated;

-- ============================================================
-- MIGRERING: kör bara det här blocket om du redan har en databas
-- från ett tidigare skede och bara vill lägga till de nya
-- bekvämlighets-fälten (dusch, wifi, el, husdjur, kök, favorit, sovplatser).
-- Säkert att köra flera gånger.
-- ============================================================
alter table public.places add column if not exists has_shower boolean default false;
alter table public.places add column if not exists has_wifi boolean default false;
alter table public.places add column if not exists has_power boolean default false;
alter table public.places add column if not exists pets_allowed boolean default false;
alter table public.places add column if not exists has_kitchen boolean default false;
alter table public.places add column if not exists is_favorite boolean default false;
alter table public.places add column if not exists capacity integer;
