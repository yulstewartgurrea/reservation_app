variable "env" {}

variable "project_name" {
  type    = string
  default = ""
}

variable "root_domain" {
  description = "Apex domain registered at dot.ph (e.g. bookme.ph). One public hosted zone is created for it; every env's subdomain lives inside this single zone."
  type        = string
}
