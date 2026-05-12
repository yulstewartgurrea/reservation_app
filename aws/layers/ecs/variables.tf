variable "project_name" {
  type    = string
  default = ""
}

variable "env" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "vpc" {
  type    = any
  default = {}
}

variable "create_ecs_cluster" {
  type    = bool
  default = true
}

variable "ecs_cluster" {
  type    = any
  default = {}
}

variable "ecs_cluster_name" {
  type    = string
  default = ""
}

variable "create_external_load_balancer" {
  type    = bool
  default = false
}

variable "external_load_balancer" {
  type    = any
  default = {}
}

variable "create_internal_load_balancer" {
  type    = bool
  default = true
}

variable "internal_load_balancer" {
  type    = any
  default = {}
}

variable "defaults" {
  type    = any
  default = {}
}

variable "ecs_services" {
  type    = any
  default = {}
}

variable "websocket_target_group_arn" {
  type    = string
  default = ""
}

variable "websocket_alb_security_group_id" {
  type    = string
  default = ""
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}
