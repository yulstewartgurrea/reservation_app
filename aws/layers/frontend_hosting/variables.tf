variable "env" {}

variable "project_name" {
  type    = string
  default = ""
}

variable "frontend_bucket_name" {
  description = "S3 bucket that holds the static Next.js export."
  type        = string
}

variable "frontend_domains" {
  description = "Custom hostnames this distribution serves. The first entry is the primary/canonical host (ACM cert common name); the rest become SANs + aliases. Empty = CloudFront default *.cloudfront.net cert only. e.g. stage [\"staging.bookme.ph\"], prod [\"bookme.ph\", \"www.bookme.ph\"]."
  type        = list(string)
  default     = []
}

variable "route53_zone_id" {
  description = "Hosted zone ID of the root domain (from the dns layer). Required when frontend_domains is non-empty: ACM DNS-validation records and the alias A/AAAA records are written here."
  type        = string
  default     = ""
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

variable "github_environments" {
  description = "GitHub Environment names allowed to assume this role. e.g. [\"staging\"] or [\"prod\"]. When a workflow job runs with `environment: X`, GitHub's OIDC token's `sub` claim is `repo:OWNER/REPO:environment:X` — we match on that, NOT on branch refs."
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

# ---------------------------------------------------------------------------
# Backend routing (CloudFront → internal ALB via VPC Origin).
# When backend_alb_arn is empty, no API behaviors are created — useful for the
# first apply, before the ecs layer exists.
# ---------------------------------------------------------------------------
variable "backend_alb_arn" {
  description = "ARN of the internal ALB serving the API. Empty disables /api/* routing."
  type        = string
  default     = ""
}

variable "backend_alb_dns_name" {
  description = "DNS name of the internal ALB (used as CloudFront origin domain)."
  type        = string
  default     = ""
}

variable "backend_api_path_pattern" {
  description = "CloudFront path pattern routed to the backend (HTTP API)."
  type        = string
  default     = "/api/*"
}

variable "backend_ws_path_pattern" {
  description = "CloudFront path pattern routed to the backend (WebSocket)."
  type        = string
  default     = "/ws/*"
}
