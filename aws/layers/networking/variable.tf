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

variable "create_database_internet_gateway_route" {
  description = "Add a 0.0.0.0/0 → IGW route to the database route table so a publicly_accessible RDS instance is reachable. Non-prod convenience only; access stays SG-gated. Keep false for prod."
  type        = bool
  default     = false
}
