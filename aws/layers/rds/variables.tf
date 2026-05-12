variable "env" {}
variable "vpc_cidr" {}
variable "vpc_id" {}

variable "db_subnet_group_name" {}
variable "database_subnet_ids" {
  type = list(string)
}

variable "project_name" {
  type = string
}

variable "create_rds" {
  type    = bool
  default = false
}

variable "create_aurora" {
  type    = bool
  default = false
}

variable "rds_settings" {
  type    = any
  default = {}
}
