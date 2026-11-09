-- =====================================================================
-- Automatisch benaderen (campagnes per vacature)
-- Uitvoeren in Supabase: SQL Editor → plak dit hele bestand → Run.
-- (Na de migraties van fase 1, 2 en 3.)
--
-- Besluit Sunny (11 nov 2026): per vacature keurt een mens één keer de
-- zoekopdracht en de berichttekst (NL + EN) goed. Daarna benadert het
-- systeem elke werkdag zelf nieuwe kandidaten binnen de LinkedIn-limieten.
-- Harde regel 1 blijft: elk automatisch bericht moet EXACT de goedgekeurde
-- tekst zijn (met alleen de invulvelden ingevuld). De database controleert dat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- campaigns — één per vacature
-- ---------------------------------------------------------------------
create table public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  vacancy_id         uuid not null unique references public.vacancies (id) on delete cascade,
  status             text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  search_query       jsonb not null default '{}'::jsonb,  -- keywords, title, location_ids, location_labels, network_distance
  template_nl        text not null default '',
  template_en        text not null default '',
  approved_by        uuid references auth.users (id) on delete set null,
  approved_by_label  text,          -- naam/e-mail, of "Teamwachtwoord" in de testmodus
  approved_at        timestamptz,
  search_cursor      text,          -- volgende pagina van de zoekopdracht
  search_exhausted   boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- Tekst of zoekopdracht gewijzigd na goedkeuring → goedkeuring vervalt, campagne stopt.
-- Actief zetten kan alleen met een geldige goedkeuring.
create or replace function public.enforce_campaign_rules()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
       new.template_nl is distinct from old.template_nl
    or new.template_en is distinct from old.template_en
    or new.search_query is distinct from old.search_query) then
    if new.approved_at is not distinct from old.approved_at then
      new.approved_at := null;
      new.approved_by := null;
      new.approved_by_label := null;
      new.status := 'draft';
    end if;
    if new.search_query is distinct from old.search_query then
      new.search_cursor := null;
      new.search_exhausted := false;
    end if;
  end if;

  if new.status = 'active' then
    if new.approved_at is null or coalesce(new.approved_by_label, '') = '' then
      raise exception 'Campagne kan pas actief worden na goedkeuring door een mens';
    end if;
    if length(trim(new.template_nl)) = 0 or length(trim(new.template_en)) = 0 then
      raise exception 'Campagne heeft een Nederlandse én een Engelse tekst nodig';
    end if;
  end if;

  -- Goedkeuring vastleggen: ingelogde gebruiker als die er is.
  if new.approved_at is not null and (tg_op = 'INSERT' or old.approved_at is null) then
    new.approved_by := coalesce(auth.uid(), new.approved_by);
  end if;
  return new;
end;
$$;

create trigger campaigns_enforce_rules
  before insert or update on public.campaigns
  for each row execute function public.enforce_campaign_rules();

-- ---------------------------------------------------------------------
-- Voortgang van het benaderen per kandidaat × vacature
-- ---------------------------------------------------------------------
alter table public.candidate_vacancy
  add column campaign_id     uuid references public.campaigns (id) on delete set null,
  add column outreach_status text check (outreach_status in
             ('pending', 'invited', 'connected', 'messaged', 'replied', 'failed', 'skipped')),
  add column outreach_error  text,
  add column invited_at      timestamptz,
  add column connected_at    timestamptz,
  add column messaged_at     timestamptz,
  add column replied_at      timestamptz,
  add column chat_id         text;

create index candidate_vacancy_outreach_idx on public.candidate_vacancy (campaign_id, outreach_status);
create index candidate_vacancy_replied_idx on public.candidate_vacancy (replied_at desc) where replied_at is not null;

alter table public.messages add column campaign_id uuid references public.campaigns (id) on delete set null;
create index messages_chat_idx on public.messages (unipile_chat_id);
create unique index messages_unipile_message_idx on public.messages (unipile_message_id) where unipile_message_id is not null;

-- ---------------------------------------------------------------------
-- De goedgekeurde tekst invullen voor één kandidaat. Eén bron van waarheid:
-- de app gebruikt deze functie om het bericht te maken, en de trigger
-- gebruikt hem om te controleren dat er niets aan veranderd is.
-- Invulvelden: {voornaam} {functie} {plaats} {afzender} {afzender_functie} {bedrijf}
-- ---------------------------------------------------------------------
create or replace function public.setting_text(p_key text, p_default text)
returns text
language sql
stable
as $$
  select coalesce((select value #>> '{}' from public.settings where key = p_key), p_default);
$$;

create or replace function public.render_campaign_message(p_campaign_id uuid, p_candidate_id uuid)
returns text
language sql
stable
as $$
  select
    replace(replace(replace(replace(replace(replace(
      case when c.language = 'nl' then cp.template_nl else cp.template_en end,
      '{voornaam}', split_part(trim(c.full_name), ' ', 1)),
      '{functie}', v.title),
      '{plaats}', coalesce(nullif(trim(v.location), ''), case when c.language = 'nl' then 'jouw regio' else 'your region' end)),
      '{afzender_functie}', public.setting_text('sender_title', '')),
      '{afzender}', public.setting_text('sender_name', '')),
      '{bedrijf}', public.setting_text('company_name', ''))
  from public.campaigns cp
  join public.vacancies v on v.id = cp.vacancy_id
  join public.candidates c on c.id = p_candidate_id
  where cp.id = p_campaign_id;
$$;

-- ---------------------------------------------------------------------
-- HARDE REGEL 1, uitgebreid: naast "een mens keurt elk bericht goed" mag
-- een bericht ook automatisch goedgekeurd worden als het EXACT de door een
-- mens goedgekeurde campagnetekst is.
-- ---------------------------------------------------------------------
create or replace function public.enforce_message_rules()
returns trigger
language plpgsql
as $$
declare
  cand_status text;
  cp record;
begin
  if new.direction = 'in' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status <> 'draft' then
    -- Enige uitzondering: automatisch bericht uit een goedgekeurde, actieve campagne.
    if new.status = 'approved' and new.campaign_id is not null then
      select * into cp from public.campaigns where id = new.campaign_id;
      if cp.id is null or cp.status <> 'active' or cp.approved_at is null then
        raise exception 'Campagne is niet actief of niet goedgekeurd';
      end if;
      if new.body is distinct from public.render_campaign_message(new.campaign_id, new.candidate_id) then
        raise exception 'Berichttekst wijkt af van de goedgekeurde campagnetekst';
      end if;
      new.approved_by := cp.approved_by;
      new.approved_at := now();
    else
      raise exception 'Nieuw uitgaand bericht moet status draft hebben (kreeg %)', new.status;
    end if;
  end if;

  if new.status in ('draft', 'approved', 'queued', 'sent') then
    select status into cand_status from public.candidates where id = new.candidate_id;
    if cand_status in ('opted_out', 'anonymized') then
      raise exception 'Kandidaat is afgemeld of geanonimiseerd: niet benaderen';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'approved' then
      if auth.uid() is null then
        raise exception 'Goedkeuren kan alleen door een ingelogde gebruiker';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
    if new.status = 'queued' and old.status not in ('approved', 'failed') then
      raise exception 'Alleen goedgekeurde berichten mogen in de wachtrij (was %)', old.status;
    end if;
    if new.status = 'sent' and old.status not in ('approved', 'queued') then
      raise exception 'Alleen goedgekeurde berichten mogen verzonden worden (was %)', old.status;
    end if;
    if new.status in ('queued', 'sent') and new.approved_at is null then
      raise exception 'Bericht heeft geen goedkeuring';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status in ('approved', 'queued', 'sent')
     and new.body is distinct from old.body then
    raise exception 'Tekst van een goedgekeurd bericht kan niet meer gewijzigd worden; zet het eerst terug naar concept';
  end if;

  return new;
end;
$$;

-- Tijdstippen voor het controleren van connecties en reacties (willekeurig gespreid).
insert into public.rate_state (key, next_at) values ('relations_check', now()), ('chats_check', now())
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Beveiliging
-- ---------------------------------------------------------------------
alter table public.campaigns enable row level security;
create policy "team mag alles" on public.campaigns for all to authenticated using (true) with check (true);
