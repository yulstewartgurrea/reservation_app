output "zone_id" {
  description = "Route 53 hosted zone ID for the root domain. Consumed by every env's frontend_hosting layer (ACM validation + alias records)."
  value       = aws_route53_zone.root.zone_id
}

output "zone_name" {
  value = aws_route53_zone.root.name
}

output "name_servers" {
  description = "Set THESE four name servers on the domain in the dot.ph dashboard (Manage -> bookme.ph -> Nameservers), replacing dot.ph's defaults."
  value       = aws_route53_zone.root.name_servers
}

output "ses_domain_identity_arn" {
  description = "ARN of the account-wide SES domain identity for the root domain. Both envs' SES layers send AS this identity."
  value       = aws_sesv2_email_identity.root_domain.arn
}

output "ses_domain_identity_name" {
  description = "Email identity name (the bare domain). Use as the value of SES SendingAuthorizationIdentity if you ever scope per-env policies."
  value       = aws_sesv2_email_identity.root_domain.email_identity
}

output "resend_record_names" {
  description = "Resend verification records currently managed in the zone (empty until resend_verify_records is set in global.hcl). Cross-check against the Resend dashboard's 'Verified' status."
  value       = [for r in aws_route53_record.resend : r.fqdn]
}
