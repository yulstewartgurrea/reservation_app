terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

locals {
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl")).locals
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
}

inputs = {
  github_repo         = local.region_vars.github_repo
  github_environments = try(local.region_vars.github_environments, [])
  github_branches     = try(local.region_vars.github_branches, [])

  # Set to false in region.hcl if the GitHub OIDC provider already exists in this account
  # (e.g. created by another project). Defaults to true for a fresh account.
  create_oidc_provider = try(local.region_vars.create_oidc_provider, true)

  # Names of ECS task roles the deployer can iam:PassRole. Derived from the ecs_services map
  # so adding a new service auto-grants pass-role rights.
  task_role_names = flatten([
    for svc, cfg in local.region_vars.ecs_services : [
      "role-${svc}-task",
      "role-${svc}-task-exec",
    ]
  ])

  state_bucket    = "terraform-states-${local.account_vars.account_id}-${local.region_vars.aws_region}"
  ecr_arn_pattern = "arn:aws:ecr:${local.region_vars.aws_region}:${local.account_vars.account_id}:repository/${local.region_vars.project_name}/${local.region_vars.env}/*"
}
