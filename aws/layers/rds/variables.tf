variable "env" {}
variable "vpc_cidr" {}
variable "vpc_id" {}

variable "db_subnet_group_name" {}
variable "database_subnet_ids" {
  type = list(string)
}

variable "rds_publicly_accessible" {
  description = "If true, RDS is placed in public subnets with a public endpoint. Ingress is STILL restricted to the security group (VPC CIDR + db_allowed_cidrs). Use only for non-prod convenience."
  type        = bool
  default     = false
}

variable "db_allowed_cidrs" {
  description = "Extra CIDRs allowed to reach Postgres in addition to the VPC CIDR — e.g. your laptop's public IP as \"203.0.113.7/32\". Keep this tight; never 0.0.0.0/0."
  type        = list(string)
  default     = []
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
