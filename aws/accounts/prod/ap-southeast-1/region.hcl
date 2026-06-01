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
  frontend_bucket_name = "s3-${local.project_name}-${local.env}-frontend"
  # Apex + www both serve the prod distribution (no redirect; both are aliases).
  # Inert until the prod stack is actually applied — see aws/DOCUMENTATION.md.
  frontend_domains     = ["bookme.ph", "www.bookme.ph"]
  frontend_price_class = "PriceClass_100" # NA + EU only (cheapest tier)

  # GitHub repo allowed to assume the deploy role via OIDC.
  github_repo = "yulstewartgurrea/reservation_app"
  # GitHub Environments allowed to deploy here. The workflow sets `environment: prod`,
  # so the OIDC token's sub claim becomes `repo:OWNER/REPO:environment:prod` — we match on that.
  github_environments = ["prod"]
}
