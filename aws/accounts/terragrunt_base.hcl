locals {
  global_vars  = read_terragrunt_config(find_in_parent_folders("global.hcl")).locals
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl")).locals

  env      = local.region_vars.env
  region   = local.region_vars.aws_region
  env_type = local.region_vars.env_type
  layer    = basename(get_original_terragrunt_dir())

  # Resolved without depending on git: terragrunt_base.hcl lives at aws/accounts/, so
  # accounts_dir = aws/accounts and aws_root = aws.
  accounts_dir = dirname(find_in_parent_folders("terragrunt_base.hcl"))
  aws_root     = "${local.accounts_dir}/.."

  # In CI we authenticate via OIDC (env-var credentials), not a named profile.
  # Local dev uses ~/.aws/credentials with the profile_name from account.hcl.
  in_ci         = get_env("CI", "") != ""
  resolved_profile = local.in_ci ? null : try(local.account_vars.profile_name, null)
}

generate "versions" {
  path      = "_versions_override.tf"
  if_exists = "overwrite_terragrunt"
  contents  = file("${local.accounts_dir}/_common/versions_override.tf")
}

generate "variables" {
  path      = "_variables.tf"
  if_exists = "overwrite_terragrunt"
  contents  = file("${local.accounts_dir}/_common/variables.tf")
}

generate "providers" {
  path      = "_providers.tf"
  if_exists = "overwrite"
  contents  = file("${local.accounts_dir}/_common/providers.tf")
}

remote_state {
  backend = "s3"
  config = {
    encrypt = true
    region  = local.region
    key     = format("%s/terraform.tfstate", path_relative_to_include())
    bucket  = format("terraform-states-%s-%s", local.account_vars.account_id, local.region_vars.aws_region)
    profile = local.resolved_profile

    # The state bucket is bootstrap infra — its SSE / root-access / TLS-enforcement
    # policies are configured once during setup (via the admin profile locally).
    # CI deploy roles only have state read/write perms, so don't try to re-enforce
    # these every run.
    skip_bucket_ssencryption  = true
    skip_bucket_root_access   = true
    skip_bucket_enforced_tls  = true
  }
  generate = {
    path      = "_backend.tf"
    if_exists = "overwrite"
  }
}

download_dir = "${local.aws_root}/.terragrunt-cache/${path_relative_to_include()}"

inputs = merge(
  local.global_vars,
  local.account_vars,
  local.region_vars,
  # In CI, blank out profile_name so providers.tf falls back to env-var credentials
  # (OIDC). Local dev keeps the named profile from account.hcl.
  local.in_ci ? { profile_name = "" } : {},
  {
    common_tags = {
      project         = local.region_vars.project_name
      environment     = local.env
      environment-type = local.env_type
      created-by      = "terraform"
      managed-by      = "terraform"
      layer           = local.layer
    }
  }
)
