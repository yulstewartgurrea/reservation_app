output "bucket_name" {
  description = "S3 bucket holding the static frontend build."
  value       = module.frontend_bucket.s3_bucket_id
}

output "bucket_arn" {
  value = module.frontend_bucket.s3_bucket_arn
}

output "cloudfront_distribution_id" {
  description = "Pass this to `aws cloudfront create-invalidation` after each deploy."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain (e.g. dxxxxxx.cloudfront.net). Always works; custom domains alias to this."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "custom_domains" {
  description = "Custom hostnames this distribution serves once DNS + ACM validate."
  value       = var.frontend_domains
}

output "acm_certificate_arn" {
  description = "us-east-1 ACM cert backing the custom domains (null when none configured)."
  value       = local.use_custom_domain ? aws_acm_certificate.frontend[0].arn : null
}

output "github_deploy_role_arn" {
  description = "Add this to GitHub Actions as a repo variable (AWS_DEPLOY_ROLE_STAGING / _PROD)."
  value       = aws_iam_role.github_deploy.arn
}

output "github_oidc_provider_arn" {
  description = "OIDC provider ARN — pass this into the *other* env's terragrunt inputs so it isn't created twice."
  value       = local.oidc_provider_arn
}
