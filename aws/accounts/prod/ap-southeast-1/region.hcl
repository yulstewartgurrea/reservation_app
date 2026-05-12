locals {
  # ---------------------------------------------------------------------------
  # Environment
  # ---------------------------------------------------------------------------
  env          = "prod"
  env_type     = "prod"
  aws_region   = "ap-southeast-1"
  project_name = "reservation"

  global_vars = read_terragrunt_config(find_in_parent_folders("global.hcl")).locals
  account_id  = local.global_vars.prod_account_id

  # ---------------------------------------------------------------------------
  # Frontend hosting (S3 + CloudFront for the Next.js static export)
  # ---------------------------------------------------------------------------
  frontend_bucket_name      = "s3-${local.project_name}-${local.env}-frontend"
  frontend_cloudfront_alias = []   # add custom domains here when ACM cert exists
  frontend_price_class      = "PriceClass_100"  # NA + EU only (cheapest tier)

  # GitHub repo allowed to assume the deploy role via OIDC.
  github_repo = "yulstewartgurrea/reservation_app"
  # Branches that may deploy to this env (sub claim filter on the OIDC token).
  github_deploy_refs = ["refs/heads/main"]
}
