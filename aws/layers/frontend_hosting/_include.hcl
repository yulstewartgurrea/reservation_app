terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

locals {
  region_vars = read_terragrunt_config(find_in_parent_folders("region.hcl")).locals
}

inputs = {
  frontend_bucket_name      = local.region_vars.frontend_bucket_name
  frontend_cloudfront_alias = try(local.region_vars.frontend_cloudfront_alias, [])
  frontend_price_class      = try(local.region_vars.frontend_price_class, "PriceClass_100")
  github_repo               = local.region_vars.github_repo
  github_deploy_refs        = local.region_vars.github_deploy_refs
}
