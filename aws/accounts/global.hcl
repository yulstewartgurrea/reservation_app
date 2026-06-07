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
  # identity). Values pasted verbatim from the Resend Domains page (region:
  # Tokyo / ap-northeast-1). See layers/dns/variables.tf for field meanings.
  # After editing, re-apply the `dns` layer: cd accounts/stage/ap-southeast-1/dns
  # && terragrunt apply. Resend's poller flips the domain to Verified within
  # minutes once these resolve.
  resend_verify_records = [
    { name = "send.bookme.ph", type = "MX", value = "feedback-smtp.ap-northeast-1.amazonses.com", priority = 10 },
    { name = "send.bookme.ph", type = "TXT", value = "v=spf1 include:amazonses.com ~all", priority = null },
    { name = "resend._domainkey.bookme.ph", type = "TXT", value = "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/OnoteCX+lOJ80ctyEhbvRWCVwz2bhbEYXgi+SDygbQV5f+GTIWjWNsMgDI7JnBMI2R8G7au1x8e3NCW8Ns8GmmZLpzycpXau1MtvjhhXu+21zPAvxy6RgZNODRdjTuBEeCZ6O9oy8iPrlXXtuzTB6rTiQDTgwJ3wvkmsTYOXsQIDAQAB", priority = null },
  ]
}
