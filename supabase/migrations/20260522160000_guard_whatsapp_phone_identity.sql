-- Guard against provider normalization bugs that shorten WhatsApp phone identities.
-- This blocks updates like 55279925470932 -> 5527992547093 while still allowing
-- a real number swap to a different phone.

CREATE OR REPLACE FUNCTION public.block_shortened_phone_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_digits text;
  new_digits text;
BEGIN
  old_digits := regexp_replace(coalesce(to_jsonb(OLD)->>'phone_number', to_jsonb(OLD)->>'phone', ''), '\D', '', 'g');
  new_digits := regexp_replace(coalesce(to_jsonb(NEW)->>'phone_number', to_jsonb(NEW)->>'phone', ''), '\D', '', 'g');

  IF old_digits <> ''
     AND new_digits <> ''
     AND old_digits <> new_digits
     AND length(old_digits) > length(new_digits)
     AND length(old_digits) - length(new_digits) <= 3
     AND left(old_digits, length(new_digits)) = new_digits
  THEN
    RAISE EXCEPTION
      'Blocked shortened WhatsApp phone identity: % -> %',
      old_digits,
      new_digits
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_shortened_whatsapp_instance_phone
ON public.whatsapp_instances;

CREATE TRIGGER block_shortened_whatsapp_instance_phone
BEFORE UPDATE OF phone_number ON public.whatsapp_instances
FOR EACH ROW
WHEN (OLD.phone_number IS DISTINCT FROM NEW.phone_number)
EXECUTE FUNCTION public.block_shortened_phone_identity();

CREATE OR REPLACE FUNCTION public.block_shortened_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_digits text;
  new_digits text;
BEGIN
  old_digits := regexp_replace(coalesce(OLD.phone, ''), '\D', '', 'g');
  new_digits := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');

  IF old_digits <> ''
     AND new_digits <> ''
     AND old_digits <> new_digits
     AND length(old_digits) > length(new_digits)
     AND length(old_digits) - length(new_digits) <= 3
     AND left(old_digits, length(new_digits)) = new_digits
  THEN
    RAISE EXCEPTION
      'Blocked shortened contact phone identity: % -> %',
      old_digits,
      new_digits
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_shortened_contact_phone
ON public.contacts;

CREATE TRIGGER block_shortened_contact_phone
BEFORE UPDATE OF phone ON public.contacts
FOR EACH ROW
WHEN (OLD.phone IS DISTINCT FROM NEW.phone)
EXECUTE FUNCTION public.block_shortened_contact_phone();
