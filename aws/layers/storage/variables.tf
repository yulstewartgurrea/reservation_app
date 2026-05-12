variable "env" {}

variable "project_name" {
  type    = string
  default = ""
}

variable "bucket_names_private" {
  type    = list(string)
  default = []
}

variable "bucket_names_public" {
  type    = list(string)
  default = []
}
