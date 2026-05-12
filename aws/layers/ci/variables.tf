variable "env" {
  type = string
}

variable "project_name" {
  type = string
}

variable "github_repo" {
  description = "GitHub repo path that may assume the deploy role, e.g. 'org/repo'."
  type        = string
}

variable "github_environments" {
  description = "GitHub Environments scoped to deploy here (matches sub claim 'repo:OWNER/REPO:environment:NAME')."
  type        = list(string)
  default     = []
}

variable "github_branches" {
  description = "Branches allowed to deploy directly (matches 'repo:OWNER/REPO:ref:refs/heads/NAME'). Empty list = environment-only."
  type        = list(string)
  default     = []
}

variable "create_oidc_provider" {
  description = "Whether to create the GitHub OIDC provider in this account. Set to false if one already exists."
  type        = bool
  default     = true
}

variable "task_role_names" {
  description = "ECS task role names the CI deployer can iam:PassRole when registering new task definitions."
  type        = list(string)
  default     = []
}

variable "state_bucket" {
  description = "S3 bucket holding Terragrunt remote state."
  type        = string
}

variable "ecr_arn_pattern" {
  description = "ARN pattern (wildcard) of ECR repos the CI deployer may push to."
  type        = string
}
