resource "aws_ssm_parameter" "rds_host" {
  count = var.create_rds ? 1 : 0
  name  = "/${var.project_name}/${var.env}/rds_host"
  type  = "String"
  value = module.rds[0].db_instance_address
}

resource "aws_ssm_parameter" "rds_port" {
  count = var.create_rds ? 1 : 0
  name  = "/${var.project_name}/${var.env}/rds_port"
  type  = "String"
  value = tostring(var.rds_settings.port)
}

resource "aws_ssm_parameter" "rds_db_name" {
  count = var.create_rds ? 1 : 0
  name  = "/${var.project_name}/${var.env}/rds_db_name"
  type  = "String"
  value = length(module.rds[0].db_instance_name) > 0 ? module.rds[0].db_instance_name : try(var.rds_settings.db_name, "postgres")
}

resource "aws_ssm_parameter" "rds_username" {
  count = var.create_rds ? 1 : 0
  name  = "/${var.project_name}/${var.env}/rds_username"
  type  = "String"
  value = try(var.rds_settings.username, "db_admin")
}

resource "aws_ssm_parameter" "rds_password" {
  count = var.create_rds ? 1 : 0
  name  = "/${var.project_name}/${var.env}/rds_password"
  type  = "SecureString"
  value = random_password.db_password[0].result
}

resource "aws_ssm_parameter" "rds_connection_url" {
  count = var.create_rds ? 1 : 0
  name  = "/${var.project_name}/${var.env}/rds_connection_url"
  type  = "SecureString"
  value = "postgresql://${try(var.rds_settings.username, "db_admin")}:${random_password.db_password[0].result}@${module.rds[0].db_instance_endpoint}/${module.rds[0].db_instance_name}?sslmode=require"
}
