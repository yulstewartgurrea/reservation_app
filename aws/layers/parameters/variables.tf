variable "env" {
  type = string
}

variable "ssm_parameters" {
  description = "List of SSM parameters to create. Each entry: { name, value, type? }. type defaults to String; use SecureString for secrets."
  type        = list(map(string))
  default     = []
}

variable "secret_parameters" {
  description = "Optional list of Secrets Manager secrets to create. Each entry: { name, value }."
  type        = list(map(string))
  default     = []
}
