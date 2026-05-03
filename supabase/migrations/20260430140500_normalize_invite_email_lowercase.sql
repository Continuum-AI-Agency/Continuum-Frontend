-- Phase 5: normalize invite + permission emails to lowercase to prevent
-- mismatched-casing bugs where an invite sent to "User@Example.com" never
-- resolves against the same address signed up as "user@example.com".

update brand_profiles.invites
   set email = lower(email)
 where email is not null
   and email <> lower(email);

update brand_profiles.permissions
   set email = lower(email)
 where email is not null
   and email <> lower(email);

alter table brand_profiles.invites
  add constraint invites_email_lowercase_check
  check (email = lower(email)) not valid;

alter table brand_profiles.invites
  validate constraint invites_email_lowercase_check;

alter table brand_profiles.permissions
  add constraint permissions_email_lowercase_check
  check (email is null or email = lower(email)) not valid;

alter table brand_profiles.permissions
  validate constraint permissions_email_lowercase_check;
