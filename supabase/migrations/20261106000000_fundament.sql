-- =====================================================================
-- Fase 1 — Fundament: alle tabellen voor het AI-recruitmentsysteem
-- Uitvoeren in Supabase: SQL Editor → plak dit hele bestand → Run.
-- Veilig om opnieuw te draaien? Nee: draai het één keer op een leeg project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hulpfunctie: updated_at automatisch bijwerken
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- vacancies — vacatures
-- ---------------------------------------------------------------------
create table public.vacancies (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  location     text,
  country      text not null default 'NL',          -- ISO-landcode, bijv. NL of ZA
  requirements jsonb not null default '{}'::jsonb,   -- skills, ervaring, talen, … (Fase 2)
  status       text not null default 'open'
               check (status in ('draft', 'open', 'paused', 'closed')),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger vacancies_updated_at
  before update on public.vacancies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- candidates — kandidatendatabase (geen dubbelen op LinkedIn-id)
-- ---------------------------------------------------------------------
create table public.candidates (
  id                    uuid primary key default gen_random_uuid(),
  linkedin_provider_id  text unique,                 -- uniek: voorkomt dubbelen bij import
  linkedin_url          text,
  full_name             text not null,
  headline              text,
  location              text,
  country               text,                        -- ISO-landcode; bepaalt taal
  language              text not null default 'nl'
                        check (language in ('nl', 'en')),  -- NL bij Nederlanders, anders EN
  current_company       text,
  experience            jsonb not null default '[]'::jsonb,
  skills                text[] not null default '{}',
  email                 text,
  phone                 text,
  source                text not null default 'manual'
                        check (source in ('manual', 'linkedin_search', 'linkedin_import')),
  status                text not null default 'active'
                        check (status in ('active', 'opted_out', 'anonymized')),
  opted_out_at          timestamptz,
  last_contacted_at     timestamptz,
  last_reply_at         timestamptz,
  anonymized_at         timestamptz,
  created_by            uuid references auth.users (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index candidates_status_idx on public.candidates (status);
create index candidates_last_contacted_idx on public.candidates (last_contacted_at);

create trigger candidates_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- candidate_vacancy — koppeling kandidaat ↔ vacature, met AI-advies en stage
-- ---------------------------------------------------------------------
create table public.candidate_vacancy (
  candidate_id   uuid not null references public.candidates (id) on delete cascade,
  vacancy_id     uuid not null references public.vacancies (id) on delete cascade,
  match_score    smallint check (match_score between 0 and 100),  -- AI-advies, geen besluit
  match_reason   text,
  match_details  jsonb not null default '{}'::jsonb,  -- sterke_punten, twijfels
  matched_at     timestamptz,
  stage          text not null default 'new'
                 check (stage in ('new', 'contacted', 'replied', 'interview', 'placed', 'rejected', 'opted_out')),
  stage_changed_by uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (candidate_id, vacancy_id)
);

create index candidate_vacancy_vacancy_idx on public.candidate_vacancy (vacancy_id, stage);

create trigger candidate_vacancy_updated_at
  before update on public.candidate_vacancy
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- messages — berichten (concepten, goedgekeurd, verstuurd, ontvangen)
-- ---------------------------------------------------------------------
create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references public.candidates (id) on delete cascade,
  vacancy_id          uuid references public.vacancies (id) on delete set null,
  channel             text not null
                      check (channel in ('linkedin_invite', 'linkedin_message', 'email')),
  direction           text not null check (direction in ('out', 'in')),
  subject             text,                          -- alleen voor e-mail
  body                text not null,
  status              text not null default 'draft'
                      check (status in ('draft', 'approved', 'rejected', 'queued', 'sent', 'failed', 'received')),
  follow_up_step      smallint not null default 0 check (follow_up_step between 0 and 3),
  approved_by         uuid references auth.users (id) on delete set null,
  approved_at         timestamptz,
  unipile_chat_id     text,
  unipile_message_id  text,
  reply_category      text check (reply_category in ('interest', 'no_interest', 'question', 'opt_out', 'review')),
  error               text,
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index messages_status_idx on public.messages (status, scheduled_at);
create index messages_candidate_idx on public.messages (candidate_id, created_at);

create trigger messages_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- HARDE REGEL 1: geen bericht gaat weg zonder goedkeuring door een mens.
-- HARDE REGEL 3: afgemelde kandidaten worden nooit meer benaderd.
create or replace function public.enforce_message_rules()
returns trigger
language plpgsql
as $$
declare
  cand_status text;
begin
  if new.direction = 'in' then
    return new;
  end if;

  -- Uitgaande berichten beginnen altijd als concept.
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Nieuw uitgaand bericht moet status draft hebben (kreeg %)', new.status;
  end if;

  -- Nooit een (nieuw of goedgekeurd) bericht naar een afgemelde of geanonimiseerde kandidaat.
  if new.status in ('draft', 'approved', 'queued', 'sent') then
    select status into cand_status from public.candidates where id = new.candidate_id;
    if cand_status in ('opted_out', 'anonymized') then
      raise exception 'Kandidaat is afgemeld of geanonimiseerd: niet benaderen';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Alleen een ingelogde gebruiker mag goedkeuren (niet de AI of een cron-job).
    if new.status = 'approved' then
      if auth.uid() is null then
        raise exception 'Goedkeuren kan alleen door een ingelogde gebruiker';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;

    -- In de wachtrij of verzonden kan alleen na goedkeuring.
    if new.status = 'queued' and old.status not in ('approved', 'failed') then
      raise exception 'Alleen goedgekeurde berichten mogen in de wachtrij (was %)', old.status;
    end if;
    if new.status = 'sent' and old.status not in ('approved', 'queued') then
      raise exception 'Alleen goedgekeurde berichten mogen verzonden worden (was %)', old.status;
    end if;
    if new.status in ('queued', 'sent') and new.approved_by is null then
      raise exception 'Bericht heeft geen goedkeuring van een gebruiker';
    end if;
  end if;

  -- Tekst van een goedgekeurd/verzonden bericht mag niet meer stiekem veranderen.
  if tg_op = 'UPDATE' and old.status in ('approved', 'queued', 'sent')
     and new.body is distinct from old.body then
    raise exception 'Tekst van een goedgekeurd bericht kan niet meer gewijzigd worden; zet het eerst terug naar concept';
  end if;

  return new;
end;
$$;

create trigger messages_enforce_rules
  before insert or update on public.messages
  for each row execute function public.enforce_message_rules();

-- ---------------------------------------------------------------------
-- follow_ups — ingeplande opvolging (max. 3 stappen)
-- ---------------------------------------------------------------------
create table public.follow_ups (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates (id) on delete cascade,
  vacancy_id    uuid references public.vacancies (id) on delete set null,
  message_id    uuid references public.messages (id) on delete set null,  -- het concept dat is aangemaakt
  due_at        timestamptz not null,
  step          smallint not null check (step between 1 and 3),
  done          boolean not null default false,
  created_at    timestamptz not null default now()
);

create index follow_ups_due_idx on public.follow_ups (done, due_at);

-- ---------------------------------------------------------------------
-- searches — uitgevoerde LinkedIn-zoekopdrachten
-- ---------------------------------------------------------------------
create table public.searches (
  id             uuid primary key default gen_random_uuid(),
  vacancy_id     uuid references public.vacancies (id) on delete cascade,
  query          jsonb not null default '{}'::jsonb,
  api_type       text not null default 'classic'
                 check (api_type in ('classic', 'sales_navigator', 'recruiter')),
  results_count  integer not null default 0,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- activity_log — logboek van elke actie (AVG). Alleen toevoegen, nooit wijzigen.
-- ---------------------------------------------------------------------
create table public.activity_log (
  id          bigint generated always as identity primary key,
  actor       text not null check (actor in ('user', 'system')),
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index activity_log_entity_idx on public.activity_log (entity, entity_id, created_at desc);
create index activity_log_created_idx on public.activity_log (created_at desc);

-- ---------------------------------------------------------------------
-- do_not_contact — "nooit meer benaderen"-lijst. Alleen een hash, geen
-- leesbare gegevens, zodat je het na anonimiseren nog kunt controleren.
-- ---------------------------------------------------------------------
create table public.do_not_contact (
  hash        text primary key,           -- sha256 van linkedin_provider_id of e-mail (kleine letters)
  kind        text not null check (kind in ('linkedin', 'email')),
  reason      text not null default 'opt_out',
  created_at  timestamptz not null default now()
);

create or replace function public.dnc_hash(value text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(lower(trim(value)), 'UTF8')), 'hex');
$$;

-- Nieuwe of geïmporteerde kandidaat die op de lijst staat → meteen opted_out.
create or replace function public.check_do_not_contact()
returns trigger
language plpgsql
as $$
begin
  if (new.linkedin_provider_id is not null and exists (
        select 1 from public.do_not_contact where hash = public.dnc_hash(new.linkedin_provider_id)))
     or (new.email is not null and exists (
        select 1 from public.do_not_contact where hash = public.dnc_hash(new.email))) then
    new.status := 'opted_out';
    new.opted_out_at := coalesce(new.opted_out_at, now());
  end if;
  return new;
end;
$$;

create trigger candidates_check_dnc
  before insert or update of linkedin_provider_id, email on public.candidates
  for each row execute function public.check_do_not_contact();

-- Kandidaat meldt zich af → op de lijst, alle koppelingen naar opted_out,
-- openstaande concepten en wachtrij-berichten worden geannuleerd.
create or replace function public.handle_opt_out()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'opted_out' and old.status is distinct from 'opted_out' then
    new.opted_out_at := coalesce(new.opted_out_at, now());
    if new.linkedin_provider_id is not null then
      insert into public.do_not_contact (hash, kind)
      values (public.dnc_hash(new.linkedin_provider_id), 'linkedin')
      on conflict do nothing;
    end if;
    if new.email is not null then
      insert into public.do_not_contact (hash, kind)
      values (public.dnc_hash(new.email), 'email')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger candidates_opt_out
  before update on public.candidates
  for each row execute function public.handle_opt_out();

create or replace function public.after_opt_out()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'opted_out' and old.status is distinct from 'opted_out' then
    update public.candidate_vacancy set stage = 'opted_out' where candidate_id = new.id;
    update public.messages set status = 'rejected', error = 'Kandidaat afgemeld'
      where candidate_id = new.id and direction = 'out' and status in ('draft', 'approved', 'queued');
    update public.follow_ups set done = true where candidate_id = new.id and not done;
  end if;
  return new;
end;
$$;

create trigger candidates_after_opt_out
  after update on public.candidates
  for each row execute function public.after_opt_out();

-- ---------------------------------------------------------------------
-- settings — instelbare limieten en regels
-- ---------------------------------------------------------------------
create table public.settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now()
);

create trigger settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (key, value, description) values
  ('max_invites_per_day',        '10',  'Max. connectieverzoeken per dag. Week 1: 10, daarna rustig naar max. 20.'),
  ('max_invites_per_week',       '100', 'Max. connectieverzoeken per week.'),
  ('max_messages_per_day',       '50',  'Max. LinkedIn-berichten per dag.'),
  ('max_profile_views_per_day',  '80',  'Max. profielbezoeken per dag.'),
  ('delay_min_seconds',          '30',  'Minimale willekeurige wachttijd tussen acties (seconden).'),
  ('delay_max_seconds',          '120', 'Maximale willekeurige wachttijd tussen acties (seconden).'),
  ('work_days',                  '[1,2,3,4,5]', 'Werkdagen (1 = maandag … 7 = zondag).'),
  ('work_hours',                 '{"start":"08:00","end":"18:00"}', 'Werktijden waarbinnen acties mogen.'),
  ('timezone',                   '"Europe/Amsterdam"', 'Tijdzone voor werktijden.'),
  ('skip_dutch_holidays',        'true', 'Nederlandse feestdagen gelden als niet-werkdag.'),
  ('retention_days',             '180', 'Dagen na laatste contact zonder reactie → anonimiseren.'),
  ('retention_days_engaged',     '365', 'Dagen na laatste contact voor kandidaten die wél reageerden → anonimiseren.'),
  ('follow_up_workdays',         '[4,7,14]', 'Werkdagen na vorig bericht voor opvolgstap 1, 2 en 3.'),
  ('withdraw_invite_after_days', '21',  'Niet-geaccepteerde uitnodiging intrekken na zoveel dagen.'),
  ('default_tone',               '"informeel"', 'Standaardtoon van berichten (informeel/formeel).'),
  ('notify_email_on_reply',      'true', 'E-mail naar de recruiter bij een nieuwe reactie.'),
  ('company_name',               '"Cr8las"', 'Bedrijfsnaam in berichten.'),
  ('sender_name',                '"Sunny Jansen"', 'Naam van de afzender in berichten.'),
  ('sender_title',               '"Projectmanager"', 'Functie van de afzender.'),
  ('email_from',                 '"Werkplaats@cr8las.nl"', 'Afzenderadres voor e-mail (Resend).'),
  ('privacy_url',                '""', 'Link naar de privacyverklaring voor kandidaten (Fase 9).');

-- =====================================================================
-- Beveiliging: Row Level Security
-- Alleen ingelogde collega's mogen data zien en wijzigen. Wie niet is
-- ingelogd (de "anon"-sleutel zonder sessie) ziet niets.
-- =====================================================================
alter table public.vacancies         enable row level security;
alter table public.candidates        enable row level security;
alter table public.candidate_vacancy enable row level security;
alter table public.messages          enable row level security;
alter table public.follow_ups        enable row level security;
alter table public.searches          enable row level security;
alter table public.activity_log      enable row level security;
alter table public.do_not_contact    enable row level security;
alter table public.settings          enable row level security;

create policy "team mag alles" on public.vacancies         for all to authenticated using (true) with check (true);
create policy "team mag alles" on public.candidates        for all to authenticated using (true) with check (true);
create policy "team mag alles" on public.candidate_vacancy for all to authenticated using (true) with check (true);
create policy "team mag alles" on public.messages          for all to authenticated using (true) with check (true);
create policy "team mag alles" on public.follow_ups        for all to authenticated using (true) with check (true);
create policy "team mag alles" on public.searches          for all to authenticated using (true) with check (true);

-- Logboek: lezen en toevoegen, nooit wijzigen of verwijderen.
create policy "team leest log"   on public.activity_log for select to authenticated using (true);
create policy "team schrijft log" on public.activity_log for insert to authenticated
  with check (actor = 'user' and actor_id = auth.uid());

-- Niet-benaderen-lijst: lezen en toevoegen, niet verwijderen.
create policy "team leest dnc"  on public.do_not_contact for select to authenticated using (true);
create policy "team vult dnc"   on public.do_not_contact for insert to authenticated with check (true);

-- Instellingen: lezen en wijzigen, niet verwijderen.
create policy "team leest instellingen"   on public.settings for select to authenticated using (true);
create policy "team wijzigt instellingen" on public.settings for update to authenticated using (true) with check (true);
