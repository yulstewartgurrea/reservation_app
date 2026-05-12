terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

locals {
  region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl")).locals
  account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
}

inputs = {
  repositories = try(local.region_vars.ecr_settings.repositories, {})
}
