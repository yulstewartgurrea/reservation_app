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
}
