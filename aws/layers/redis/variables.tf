variable "env" {}
variable "vpc_id" {}
variable "vpc_cidr" {}

variable "database_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "redis_settings" {
  type    = any
  default = {}
}

variable "create_redis" {
  type    = bool
  default = false
}

variable "project_name" {
  type = string
}
