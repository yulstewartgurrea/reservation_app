data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  # OIDC sub claims the CI role will accept.
  # GitHub format: repo:OWNER/REPO:environment:NAME  or  repo:OWNER/REPO:ref:refs/heads/BRANCH
  sub_environments = [for e in var.github_environments : "repo:${var.github_repo}:environment:${e}"]
  sub_branches     = [for b in var.github_branches : "repo:${var.github_repo}:ref:refs/heads/${b}"]
  allowed_subs     = concat(local.sub_environments, local.sub_branches)
}

################################################################################
# GitHub Actions OIDC provider
# One per AWS account — toggle off if it already exists.
################################################################################
resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # GitHub's OIDC thumbprints — these change rarely; AWS verifies against them.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

################################################################################
# Deployer role — assumed by GitHub Actions via OIDC
################################################################################
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.allowed_subs
    }
  }
}

resource "aws_iam_role" "deployer" {
  name               = "role-github-actions-${var.project_name}-${var.env}-deployer"
  description        = "Assumed by GitHub Actions to deploy ${var.project_name} ${var.env}"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

################################################################################
# Permissions
################################################################################
# Read-only on most of the account so `terragrunt apply` can refresh state.
resource "aws_iam_role_policy_attachment" "read_only" {
  role       = aws_iam_role.deployer.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# ECR push
resource "aws_iam_role_policy_attachment" "ecr_power" {
  role       = aws_iam_role.deployer.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

# ECS write — create/update task defs, update services, run tasks
resource "aws_iam_role_policy_attachment" "ecs_full" {
  role       = aws_iam_role.deployer.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonECS_FullAccess"
}

# Tight inline policy for things the managed policies don't cover.
data "aws_iam_policy_document" "deployer_inline" {
  # iam:PassRole — required when CI registers a new task definition that references task roles.
  statement {
    sid     = "PassEcsTaskRoles"
    actions = ["iam:PassRole"]
    resources = [
      for name in var.task_role_names : "arn:aws:iam::${local.account_id}:role/${name}"
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  # Terraform state — read/write for the ecs layer's key prefix only.
  statement {
    sid     = "TerraformStateObject"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [
      "arn:aws:s3:::${var.state_bucket}/ecs/*",
    ]
  }

  statement {
    sid       = "TerraformStateBucketList"
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
  }

  # CloudWatch Logs — create/update groups for new task def revisions.
  statement {
    sid = "EcsLogGroups"
    actions = [
      "logs:CreateLogGroup",
      "logs:PutRetentionPolicy",
      "logs:TagResource",
    ]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:/ecs/*"]
  }

  # IAM role tweaks the managed policies don't allow at the resource level.
  # Needed when terraform refreshes ECS task IAM roles.
  statement {
    sid = "IamRoleManageEcsTasks"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:ListInstanceProfilesForRole",
    ]
    resources = [
      for name in var.task_role_names : "arn:aws:iam::${local.account_id}:role/${name}"
    ]
  }
}

resource "aws_iam_role_policy" "deployer_inline" {
  name   = "deployer-inline"
  role   = aws_iam_role.deployer.id
  policy = data.aws_iam_policy_document.deployer_inline.json
}
