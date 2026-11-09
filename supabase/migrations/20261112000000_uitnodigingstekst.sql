-- =====================================================================
-- Korte tekst bij de uitnodiging (connectieverzoek)
-- Uitvoeren in Supabase: SQL Editor → plak dit hele bestand → Run.
-- (Na 20261111000000_automatisch_benaderen.sql.)
--
-- Besluit Sunny (12 nov 2026): bij het connectieverzoek een korte,
-- goedgekeurde tekst meesturen. Gratis LinkedIn-account: ±15 per week mét
-- tekst (max. 200 tekens, volgens Unipile); daarboven zonder tekst.
-- De tekst is nu het EERSTE bericht, dus moet bron + afmeldoptie bevatten.
-- =====================================================================

alter table public.campaigns
  add column invite_note_nl text not null default '',
  add column invite_note_en text not null default '';

-- Goedkeuring vervalt ook als de uitnodigingstekst wijzigt.
create or replace function public.enforce_campaign_rules()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
       new.template_nl is distinct from old.template_nl
    or new.template_en is distinct from old.template_en
    or new.invite_note_nl is distinct from old.invite_note_nl
    or new.invite_note_en is distinct from old.invite_note_en
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

  if new.approved_at is not null and (tg_op = 'INSERT' or old.approved_at is null) then
    new.approved_by := coalesce(auth.uid(), new.approved_by);
  end if;
  return new;
end;
$$;

-- Invullen voor bericht ('message') of uitnodiging ('invite'). Eén bron van waarheid.
drop function if exists public.render_campaign_message(uuid, uuid);

create or replace function public.render_campaign_message(p_campaign_id uuid, p_candidate_id uuid, p_kind text default 'message')
returns text
language sql
stable
as $$
  select
    replace(replace(replace(replace(replace(replace(
      case
        when p_kind = 'invite' then case when c.language = 'nl' then cp.invite_note_nl else cp.invite_note_en end
        else case when c.language = 'nl' then cp.template_nl else cp.template_en end
      end,
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

-- Regel 1: ook de uitnodigingstekst moet EXACT de goedgekeurde tekst zijn.
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
    if new.status = 'approved' and new.campaign_id is not null then
      select * into cp from public.campaigns where id = new.campaign_id;
      if cp.id is null or cp.status <> 'active' or cp.approved_at is null then
        raise exception 'Campagne is niet actief of niet goedgekeurd';
      end if;
      if new.body is distinct from public.render_campaign_message(
           new.campaign_id, new.candidate_id,
           case when new.channel = 'linkedin_invite' then 'invite' else 'message' end) then
        raise exception 'Berichttekst wijkt af van de goedgekeurde campagnetekst';
      end if;
      if length(trim(new.body)) = 0 then
        raise exception 'Lege tekst kan niet verstuurd worden';
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

-- Geblokkeerd tot (als LinkedIn een uitnodiging mét tekst weigert).
insert into public.rate_state (key, next_at) values ('invite_notes', now()) on conflict (key) do nothing;

insert into public.settings (key, value, description) values
  ('max_invite_notes_per_week', '15', 'Uitnodigingen MET tekst per week. Gratis LinkedIn: ±15 (Unipile). Premium: hoger (tot ±200).'),
  ('invite_note_max_chars', '200', 'Max. tekens uitnodigingstekst. Gratis LinkedIn: 200; Premium: 300.')
on conflict (key) do nothing;
