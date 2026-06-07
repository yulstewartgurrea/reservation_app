locals {
  # AWS account ID(s) and the AWS CLI profile name(s) they map to.
  # Names must match profiles in ~/.aws/credentials (or the AWS_PROFILE you export).
  # See aws/README.md for details.

  stage_account_id   = "936146782254"
  stage_profile_name = "reservation-stage"

  # Single-account model: prod resources live in the same AWS account as stage,
  # separated by bucket/distribution name and tagged environment=prod.
  prod_account_id   = "936146782254"
  prod_profile_name = "reservation-stage"

  # Apex domain registered at dot.ph (https://www.dot.ph). The `dns` layer
  # creates ONE public Route 53 hosted zone for this; both envs write records
  # into it (single-account model):
  #   bookme.ph / www.bookme.ph -> prod  CloudFront
  #   staging.bookme.ph       -> stage CloudFront
  # After applying the dns layer, copy its `name_servers` output into the
  # dot.ph dashboard (Manage -> bookme.ph -> Nameservers).
  root_domain = "bookme.ph"

  # Resend email-sending DNS for bookme.ph (account-global, like the SES domain
  # identity). Leave empty until you add the domain at https://resend.com/domains,
  # then paste the records it shows here and re-apply the `dns` layer. See
  # layers/dns/variables.tf for the field meanings (priority is MX-only).
  # Example once the dashboard gives you values:
  #   resend_verify_records = [
  #     { name = "send.bookme.ph",              type = "MX",  value = "feedback-smtp.us-east-1.amazonses.com", priority = 10 },
  #     { name = "send.bookme.ph",              type = "TXT", value = "v=spf1 include:amazonses.com ~all",      priority = null },
  #     { name = "resend._domainkey.bookme.ph", type = "TXT", value = "p=MIGfMA0GCSq...<from dashboard>",       priority = null },
  #   ]
  resend_verify_records = []
}
