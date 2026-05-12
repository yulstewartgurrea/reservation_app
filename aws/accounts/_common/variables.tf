variable "aws_region" {
  description = "AWS region to create infrastructure in"
  type        = string
}

variable "account_id" {
  description = "Allowed AWS account ID"
  type        = string
}

variable "profile_name" {
  description = "AWS profile name"
  type        = string
}

variable "common_tags" {
  type    = map(string)
  default = {}
}
