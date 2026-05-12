resource "random_password" "redis" {
  count   = var.create_redis && (try(var.redis_settings.auth_token, "") == "") ? 1 : 0
  length  = 64
  special = false
}

locals {
  redis_name       = try(var.redis_settings.name, "redis-${var.project_name}-${var.env}")
  redis_auth_token = try(random_password.redis[0].result, var.redis_settings.auth_token)
}
