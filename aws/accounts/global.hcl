locals {
  # Fill in your AWS account ID(s) and the AWS CLI profile name(s) they map to.
  # These names must match profiles in ~/.aws/credentials (or the AWS_PROFILE you export).
  # See aws/README.md for details.

  stage_account_id   = "REPLACE_WITH_STAGE_ACCOUNT_ID"
  stage_profile_name = "reservation-stage"

  # Reserved for later environments:
  # prod_account_id   = "REPLACE_WITH_PROD_ACCOUNT_ID"
  # prod_profile_name = "reservation-prod"
}
