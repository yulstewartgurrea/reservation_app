variable "env" {}

variable "project_name" {
  type    = string
  default = ""
}

variable "frontend_bucket_name" {
  description = "S3 bucket that holds the static Next.js export."
  type        = string
}

variable "frontend_cloudfront_alias" {
  description = "Optional list of custom domain aliases (CNAMEs) for the CloudFront distribution."
  type        = list(string)
  default     = []
}

variable "frontend_price_class" {
  description = "CloudFront price class. PriceClass_100 = NA + EU only (cheapest)."
  type        = string
  default     = "PriceClass_100"
}

variable "github_repo" {
  description = "GitHub repo (owner/repo) allowed to assume the deploy role via OIDC."
  type        = string
}

variable "github_deploy_refs" {
  description = "Branches/tags allowed to deploy. e.g. [\"refs/heads/develop\"], [\"refs/heads/main\"], or [\"refs/tags/v*\"]."
  type        = list(string)
  default     = []
}

# A pre-existing, account-level OIDC provider ARN. Empty means: create one in this layer.
# Set this on the *second* env (prod) to reuse the one created by stage — there can only
# be one OIDC provider per (account, issuer) pair.
variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN, or empty to create one here."
  type        = string
  default     = ""
}
