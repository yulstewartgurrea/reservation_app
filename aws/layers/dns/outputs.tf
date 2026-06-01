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
