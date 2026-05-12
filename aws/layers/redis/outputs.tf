output "redis" {
  value = module.redis
}

output "redis_security_group_id" {
  value = var.create_redis ? module.redis_security_group[0].security_group_id : null
}
