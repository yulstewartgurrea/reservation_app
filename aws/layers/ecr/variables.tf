variable "env" {
  type = string
}

variable "project_name" {
  type    = string
  default = ""
}

variable "repositories" {
  description = "Map of ECR repository names to per-repo settings."
  type        = any
  default     = {}
}
