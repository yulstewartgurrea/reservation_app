module "rds_security_group" {
  count   = var.create_rds ? 1 : 0
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.0"

  name        = "sgr-${var.project_name}-${var.env}-rds"
  description = "PostgreSQL access from inside the VPC"
  vpc_id      = var.vpc_id

  ingress_cidr_blocks = [var.vpc_cidr]
  ingress_rules       = ["postgresql-tcp"]

  egress_cidr_blocks      = ["0.0.0.0/0"]
  egress_ipv6_cidr_blocks = []
  egress_rules            = ["all-all"]
}

module "rds" {
  count   = var.create_rds ? 1 : 0
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = length(try(var.rds_settings.name, "")) > 0 ? var.rds_settings.name : "rds-${var.project_name}-${var.env}"

  engine               = var.rds_settings.engine
  engine_version       = var.rds_settings.engine_version
  family               = var.rds_settings.family
  major_engine_version = var.rds_settings.major_engine_version
  instance_class       = var.rds_settings.instance_class

  storage_type          = var.rds_settings.storage_type
  allocated_storage     = try(var.rds_settings.allocated_storage, 20)
  max_allocated_storage = try(var.rds_settings.max_allocated_storage, 100)

  db_name                     = try(var.rds_settings.db_name, "postgres")
  username                    = try(var.rds_settings.username, "db_admin")
  manage_master_user_password = false
  password                    = random_password.db_password[0].result
  port                        = var.rds_settings.port

  multi_az               = var.rds_settings.multi_az
  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = [module.rds_security_group[0].security_group_id]

  backup_window                   = var.rds_settings.backup_window
  backup_retention_period         = var.rds_settings.backup_retention_period
  maintenance_window              = var.rds_settings.maintenance_window
  enabled_cloudwatch_logs_exports = var.rds_settings.enabled_cloudwatch_logs_exports
  create_cloudwatch_log_group     = true

  copy_tags_to_snapshot            = try(var.rds_settings.copy_tags_to_snapshot, true)
  skip_final_snapshot              = try(var.rds_settings.skip_final_snapshot, true)
  final_snapshot_identifier_prefix = "final-snapshot-${var.env}"
  deletion_protection              = try(var.rds_settings.deletion_protection, false)

  performance_insights_enabled          = var.rds_settings.performance_insights_enabled
  performance_insights_retention_period = var.rds_settings.performance_insights_retention_period
  create_monitoring_role                = var.rds_settings.create_monitoring_role
  monitoring_interval                   = var.rds_settings.create_monitoring_role ? 60 : 0
  monitoring_role_name                  = "role-${var.env}-rds-monitoring"
  monitoring_role_use_name_prefix       = false

  create_db_parameter_group = true
  parameter_group_name      = "pgr-${var.env}-${var.rds_settings.family}"
  parameters                = var.rds_settings.parameters

  storage_encrypted = try(var.rds_settings.storage_encrypted, true)
}

resource "random_password" "db_password" {
  count   = var.create_rds ? 1 : 0
  length  = 24
  special = false
}
