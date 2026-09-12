create or replace function public.prevent_duplicate_contact_details()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(new.email));
  normalized_phone text := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
begin
  perform pg_advisory_xact_lock(hashtextextended('contacts-email:' || normalized_email, 0));

  if exists (
    select 1
    from public.contacts
    where lower(btrim(email)) = normalized_email
      and id is distinct from new.id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Email already exists.',
      constraint = 'contacts_email_unique_ci';
  end if;

  if normalized_phone <> '' then
    perform pg_advisory_xact_lock(hashtextextended('contacts-phone:' || normalized_phone, 0));

    if exists (
      select 1
      from public.contacts
      where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = normalized_phone
        and id is distinct from new.id
    ) then
      raise exception using
        errcode = '23505',
        message = 'Phone number already exists.',
        constraint = 'contacts_phone_unique_digits';
    end if;
  end if;

  new.email := btrim(new.email);
  new.phone := btrim(new.phone);
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_contact_details on public.contacts;

create trigger prevent_duplicate_contact_details
before insert or update of email, phone on public.contacts
for each row execute function public.prevent_duplicate_contact_details();
