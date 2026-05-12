variable "env" {}
variable "project_name" {}
variable "az_number" {}
variable "cidr" {}
variable "env_type" {}
variable "enable_nat_gateway" {}
variable "single_nat_gateway" {}

variable "enable_vpc_endpoint" {
  type    = bool
  default = true
}

variable "private_subnets_newbits" {
  type    = number
  default = 0
}

variable "public_subnets_newbits" {}

variable "database_subnets_newbits" {
  type    = number
  default = 0
}

variable "vpce_list" {
  type    = list(string)
  default = []
}

variable "manage_default_network_acl" {
  default = true
}

variable "manage_default_route_table" {
  default = true
}

variable "create_private_subnets" {
  type    = bool
  default = true
}

variable "create_database_subnets" {
  type    = bool
  default = true
}
