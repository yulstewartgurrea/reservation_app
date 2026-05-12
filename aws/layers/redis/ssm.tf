resource "aws_ssm_parameter" "redis_endpoint" {
  count = var.create_redis ? 1 : 0
  name  = "/${var.project_name}/${var.env}/redis_host"
  type  = "String"
  value = module.redis[0].replication_group_primary_endpoint_address
}

resource "aws_ssm_parameter" "redis_port" {
  count = var.create_redis ? 1 : 0
  name  = "/${var.project_name}/${var.env}/redis_port"
  type  = "String"
  value = tostring(var.redis_settings.port)
}

resource "aws_ssm_parameter" "redis_url_secure" {
  count = var.create_redis && var.redis_settings.transit_encryption_enabled ? 1 : 0
  name  = "/${var.project_name}/${var.env}/redis_url"
  type  = "SecureString"
  value = format(
    "rediss://:%s@%s:%s",
    local.redis_auth_token,
    module.redis[0].replication_group_primary_endpoint_address,
    tostring(var.redis_settings.port),
  )
}

resource "aws_ssm_parameter" "redis_url_plain" {
  count = var.create_redis && !var.redis_settings.transit_encryption_enabled ? 1 : 0
  name  = "/${var.project_name}/${var.env}/redis_url"
  type  = "String"
  value = format(
    "redis://%s:%s",
    module.redis[0].replication_group_primary_endpoint_address,
    tostring(var.redis_settings.port),
  )
}
