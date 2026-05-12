output "rds" {
  value     = var.create_rds ? module.rds : null
  sensitive = true
}

output "rds_security_group_id" {
  value = var.create_rds ? module.rds_security_group[0].security_group_id : null
}
