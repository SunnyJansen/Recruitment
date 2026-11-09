-- =====================================================================
-- Fase 3 — LinkedIn zoeken & importeren (Unipile)
-- Uitvoeren in Supabase: SQL Editor → plak dit hele bestand → Run.
-- (Na de migraties van fase 1 en 2.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- linkedin_actions — elke actie richting LinkedIn, om limieten te tellen
-- (profielbezoek, zoekopdracht, later uitnodiging en bericht).
-- ---------------------------------------------------------------------
create table public.linkedin_actions (
  id       bigint generated always as identity primary key,
  kind     text not null check (kind in ('profile_view', 'search', 'invite', 'message')),
  amount   integer not null default 1,   -- bij zoeken: aantal opgehaalde resultaatregels
  at       timestamptz not null default now(),
  details  jsonb not null default '{}'::jsonb
);

create index linkedin_actions_kind_at_idx on public.linkedin_actions (kind, at desc);

-- rate_state — wanneer de volgende automatische LinkedIn-actie mag (willekeurige pauze)
create table public.rate_state (
  key      text primary key,
  next_at  timestamptz not null default now()
);
insert into public.rate_state (key) values ('linkedin');

-- ---------------------------------------------------------------------
-- import_queue — geselecteerde zoekresultaten die één voor één (met
-- pauzes) worden opgehaald en als kandidaat opgeslagen.
-- ---------------------------------------------------------------------
create table public.import_queue (
  id                 uuid primary key default gen_random_uuid(),
  vacancy_id         uuid references public.vacancies (id) on delete cascade,
  search_id          uuid references public.searches (id) on delete set null,
  provider_id        text not null,
  public_identifier  text,
  name               text,
  status             text not null default 'pending'
                     check (status in ('pending', 'processing', 'done', 'skipped', 'failed')),
  result             text,          -- korte uitleg, bijv. "bestond al" of foutmelding
  candidate_id       uuid references public.candidates (id) on delete set null,
  attempts           smallint not null default 0,
  claimed_at         timestamptz,
  created_by         uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  processed_at       timestamptz
);

-- Dezelfde persoon niet twee keer tegelijk in de wachtrij.
create unique index import_queue_open_provider_idx
  on public.import_queue (provider_id)
  where status in ('pending', 'processing');
create index import_queue_status_idx on public.import_queue (status, created_at);

-- ---------------------------------------------------------------------
-- Tellen per dag/week in Nederlandse tijd.
-- ---------------------------------------------------------------------
create or replace function public.linkedin_count(p_kind text, p_period text)
returns integer
language sql
stable
as $$
  select coalesce(sum(amount), 0)::int
  from public.linkedin_actions
  where kind = p_kind
    and at >= case p_period
      when 'week' then date_trunc('week', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam'
      else date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam'
    end;
$$;

-- ---------------------------------------------------------------------
-- linkedin_take_slot — HARDE REGEL 2 in de database:
-- mag er nu een automatische LinkedIn-actie gebeuren? Zo ja: vastleggen en
-- de volgende pas na een willekeurige pauze toestaan. Atomair (row lock),
-- dus ook veilig als meerdere mensen tegelijk werken.
-- Geeft {ok, reason, wait_seconds, used, limit}.
-- ---------------------------------------------------------------------
create or replace function public.linkedin_take_slot(
  p_kind text,
  p_daily_limit integer,
  p_weekly_limit integer default null,
  p_min_delay integer default 30,
  p_max_delay integer default 120,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next   timestamptz;
  v_used   integer;
  v_week   integer;
  v_delay  integer;
begin
  select next_at into v_next from public.rate_state where key = 'linkedin' for update;
  if v_next > now() then
    return jsonb_build_object('ok', false, 'reason', 'wait',
      'wait_seconds', ceil(extract(epoch from (v_next - now())))::int);
  end if;

  v_used := public.linkedin_count(p_kind, 'day');
  if v_used >= p_daily_limit then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'used', v_used, 'limit', p_daily_limit);
  end if;
  if p_weekly_limit is not null then
    v_week := public.linkedin_count(p_kind, 'week');
    if v_week >= p_weekly_limit then
      return jsonb_build_object('ok', false, 'reason', 'weekly_limit', 'used', v_week, 'limit', p_weekly_limit);
    end if;
  end if;

  insert into public.linkedin_actions (kind, details) values (p_kind, p_details);
  v_delay := p_min_delay + floor(random() * (greatest(p_max_delay, p_min_delay) - p_min_delay + 1))::int;
  update public.rate_state set next_at = now() + make_interval(secs => v_delay) where key = 'linkedin';
  return jsonb_build_object('ok', true, 'used', v_used + 1, 'limit', p_daily_limit, 'wait_seconds', v_delay);
end;
$$;

-- Zoekopdrachten: tellen het aantal opgehaalde resultaatregels per dag (geen pauze nodig,
-- dit is een handmatige actie van de recruiter, net als in LinkedIn zelf).
create or replace function public.linkedin_record_search(p_results integer, p_daily_limit integer, p_details jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  perform 1 from public.rate_state where key = 'linkedin' for update;
  v_used := public.linkedin_count('search', 'day');
  if v_used >= p_daily_limit then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'used', v_used, 'limit', p_daily_limit);
  end if;
  insert into public.linkedin_actions (kind, amount, details) values ('search', greatest(p_results, 0), p_details);
  return jsonb_build_object('ok', true, 'used', v_used + greatest(p_results, 0), 'limit', p_daily_limit);
end;
$$;

-- Volgende import uit de wachtrij pakken (atomair; nooit twee keer dezelfde).
create or replace function public.claim_next_import(p_vacancy_id uuid default null)
returns setof public.import_queue
language sql
as $$
  update public.import_queue
  set status = 'processing', attempts = attempts + 1, claimed_at = now()
  where id = (
    select id from public.import_queue
    where status = 'pending' and (p_vacancy_id is null or vacancy_id = p_vacancy_id)
    order by created_at
    limit 1
    for update skip locked
  )
  returning *;
$$;

-- Vastgelopen items (bijv. tabblad gesloten tijdens ophalen) na 10 min weer vrijgeven.
create or replace function public.release_stuck_imports()
returns integer
language sql
as $$
  with r as (
    update public.import_queue set status = 'pending'
    where status = 'processing' and attempts < 3
      and claimed_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::int from r;
$$;

insert into public.settings (key, value, description) values
  ('max_search_results_per_day', '1000', 'Max. opgehaalde zoekresultaten per dag (aanbeveling Unipile: 1.000).'),
  ('search_page_size', '10', 'Zoekresultaten per pagina (classic LinkedIn: max. 10; Sales Navigator/Recruiter: max. 100).')
on conflict (key) do nothing;

-- =====================================================================
-- Beveiliging
-- =====================================================================
alter table public.linkedin_actions enable row level security;
alter table public.rate_state       enable row level security;
alter table public.import_queue     enable row level security;

-- Tellers: alleen lezen; schrijven gaat via de functies hierboven (security definer).
create policy "team leest linkedin_actions" on public.linkedin_actions for select to authenticated using (true);
create policy "team leest rate_state"       on public.rate_state       for select to authenticated using (true);
create policy "team mag alles"              on public.import_queue     for all to authenticated using (true) with check (true);

revoke all on function public.linkedin_take_slot(text, integer, integer, integer, integer, jsonb) from public, anon;
revoke all on function public.linkedin_record_search(integer, integer, jsonb) from public, anon;
grant execute on function public.linkedin_take_slot(text, integer, integer, integer, integer, jsonb) to authenticated, service_role;
grant execute on function public.linkedin_record_search(integer, integer, jsonb) to authenticated, service_role;
