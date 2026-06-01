output "smtp_host" {
  description = "SES SMTP endpoint for this region (use as EMAIL_HOST)."
  value       = local.smtp_host
}

output "smtp_port" {
  value = local.smtp_port
}

output "smtp_username" {
  description = "SES SMTP username (use as EMAIL_HOST_USER)."
  value       = aws_iam_access_key.smtp.id
  sensitive   = true
}

output "smtp_password" {
  description = "SES SMTP password derived via the v4 algorithm (use as EMAIL_HOST_PASSWORD). Shown once."
  value       = aws_iam_access_key.smtp.ses_smtp_password_v4
  sensitive   = true
}

output "verified_email" {
  value = aws_ses_email_identity.sender.email
}

output "ssm_parameter_paths" {
  description = "SSM parameter paths the ECS task should point at when write_smtp_creds_to_ssm = true."
  value = var.write_smtp_creds_to_ssm ? {
    EMAIL_BACKEND       = aws_ssm_parameter.email_backend[0].name
    EMAIL_HOST          = aws_ssm_parameter.smtp_host[0].name
    EMAIL_PORT          = aws_ssm_parameter.smtp_port[0].name
    EMAIL_HOST_USER     = aws_ssm_parameter.smtp_username[0].name
    EMAIL_HOST_PASSWORD = aws_ssm_parameter.smtp_password[0].name
    EMAIL_USE_TLS       = aws_ssm_parameter.email_use_tls[0].name
    DEFAULT_FROM_EMAIL  = aws_ssm_parameter.default_from_email[0].name
  } : {}
}
