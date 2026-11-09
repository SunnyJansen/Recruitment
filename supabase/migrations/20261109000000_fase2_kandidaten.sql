-- =====================================================================
-- Fase 2 — Vacatures & handmatige kandidaten
-- Uitvoeren in Supabase: SQL Editor → plak dit hele bestand → Run.
-- (Na de migratie van fase 1.)
-- =====================================================================

-- Geen dubbelen op LinkedIn-profiellink. De app slaat de link altijd in
-- dezelfde vorm op (https://www.linkedin.com/in/<naam>).
create unique index if not exists candidates_linkedin_url_key
  on public.candidates (linkedin_url)
  where linkedin_url is not null;

-- Sneller zoeken en sorteren in de lijsten.
create index if not exists candidates_created_idx on public.candidates (created_at desc);
create index if not exists vacancies_created_idx on public.vacancies (created_at desc);
create index if not exists candidates_email_idx on public.candidates (lower(email)) where email is not null;

-- ---------------------------------------------------------------------
-- Niet-benaderen-lijst ook op LinkedIn-profiellink (handmatig toegevoegde
-- kandidaten hebben geen LinkedIn-id, alleen een link).
-- ---------------------------------------------------------------------
alter table public.do_not_contact drop constraint if exists do_not_contact_kind_check;
alter table public.do_not_contact add constraint do_not_contact_kind_check
  check (kind in ('linkedin', 'linkedin_url', 'email'));

create or replace function public.check_do_not_contact()
returns trigger
language plpgsql
as $$
begin
  if (new.linkedin_provider_id is not null and exists (
        select 1 from public.do_not_contact where hash = public.dnc_hash(new.linkedin_provider_id)))
     or (new.linkedin_url is not null and exists (
        select 1 from public.do_not_contact where hash = public.dnc_hash(new.linkedin_url)))
     or (new.email is not null and exists (
        select 1 from public.do_not_contact where hash = public.dnc_hash(new.email))) then
    new.status := 'opted_out';
    new.opted_out_at := coalesce(new.opted_out_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_check_dnc on public.candidates;
create trigger candidates_check_dnc
  before insert or update of linkedin_provider_id, linkedin_url, email on public.candidates
  for each row execute function public.check_do_not_contact();

-- Afmelden: hash van LinkedIn-id, LinkedIn-link én e-mail op de lijst.
-- En: een afgemelde kandidaat kan nooit meer terug naar "actief".
create or replace function public.handle_opt_out()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'opted_out' and new.status = 'active' then
    raise exception 'Afgemelde kandidaat kan niet opnieuw actief worden (AVG)';
  end if;
  if old.status = 'anonymized' and new.status <> 'anonymized' then
    raise exception 'Geanonimiseerde kandidaat kan niet opnieuw actief worden (AVG)';
  end if;
  if new.status = 'opted_out' and old.status is distinct from 'opted_out' then
    new.opted_out_at := coalesce(new.opted_out_at, now());
    if new.linkedin_provider_id is not null then
      insert into public.do_not_contact (hash, kind)
      values (public.dnc_hash(new.linkedin_provider_id), 'linkedin')
      on conflict do nothing;
    end if;
    if new.linkedin_url is not null then
      insert into public.do_not_contact (hash, kind)
      values (public.dnc_hash(new.linkedin_url), 'linkedin_url')
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
