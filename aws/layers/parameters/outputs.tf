output "ssm_parameter_names" {
  value = [for p in aws_ssm_parameter.this : p.name]
}

output "secret_arns" {
  value     = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
  sensitive = true
}
