module "redis_security_group" {
  count   = var.create_redis ? 1 : 0
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.0"

  name        = "sgr-${var.project_name}-${var.env}-redis"
  description = "Redis access from inside the VPC"
  vpc_id      = var.vpc_id

  ingress_cidr_blocks = [var.vpc_cidr]
  ingress_rules       = ["redis-tcp"]

  egress_cidr_blocks = ["0.0.0.0/0"]
  egress_rules       = ["all-all"]
}

module "redis" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "~> 1.0"
  count   = var.create_redis ? 1 : 0

  create_cluster           = try(var.redis_settings.create_cluster, false)
  cluster_mode_enabled     = try(var.redis_settings.cluster_mode_enabled, false)
  create_replication_group = try(var.redis_settings.create_replication_group, true)
  replicas_per_node_group  = try(var.redis_settings.cluster_mode_enabled, false) ? try(var.redis_settings.replicas_per_node_group, 0) : null
  replication_group_id     = local.redis_name
  cluster_id               = local.redis_name
  description              = "ElastiCache Redis for ${var.env} environment"
  auth_token               = var.redis_settings.transit_encryption_enabled ? local.redis_auth_token : ""

  engine         = var.redis_settings.engine
  engine_version = var.redis_settings.engine_version

  port                       = var.redis_settings.port
  node_type                  = var.redis_settings.node_type
  num_cache_clusters         = try(var.redis_settings.cluster_mode_enabled, false) ? null : var.redis_settings.num_cache_clusters
  automatic_failover_enabled = var.redis_settings.automatic_failover_enabled
  multi_az_enabled           = try(var.redis_settings.multi_az_enabled, false)

  subnet_ids         = var.private_subnet_ids
  vpc_id             = var.vpc_id
  security_group_ids = [module.redis_security_group[0].security_group_id]

  maintenance_window       = var.redis_settings.maintenance_window
  snapshot_retention_limit = try(var.redis_settings.snapshot_retention_limit, 0)
  snapshot_window          = try(var.redis_settings.snapshot_window, "")

  create_parameter_group = var.redis_settings.create_parameter_group
  parameter_group_family = var.redis_settings.parameter_group_family
  parameter_group_name   = "${local.redis_name}-${var.redis_settings.parameter_group_family}"
  parameters = [
    for key, value in var.redis_settings.parameters : {
      name  = key
      value = value
    }
  ]

  at_rest_encryption_enabled = var.redis_settings.at_rest_encryption_enabled
  transit_encryption_enabled = var.redis_settings.transit_encryption_enabled

  tags = {
    Name = local.redis_name
  }
}
