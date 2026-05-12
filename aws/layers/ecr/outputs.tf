output "ecr_repository_urls" {
  description = "Map of ECR repository names to repository URLs."
  value       = { for k, r in aws_ecr_repository.app_repo : k => r.repository_url }
}
