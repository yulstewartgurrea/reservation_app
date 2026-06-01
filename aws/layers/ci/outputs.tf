output "deployer_role_arn" {
  description = "ARN of the IAM role GitHub Actions assumes via OIDC. Paste into the workflow as vars.AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deployer.arn
}

output "deployer_role_name" {
  value = aws_iam_role.deployer.name
}

output "oidc_provider_arn" {
  value = local.oidc_provider_arn
}
