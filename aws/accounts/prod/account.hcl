locals {
  env          = basename(get_terragrunt_dir())
  global_vars  = read_terragrunt_config(find_in_parent_folders("global.hcl"))
  account_id   = local.global_vars.locals.prod_account_id
  profile_name = local.global_vars.locals.prod_profile_name
}
