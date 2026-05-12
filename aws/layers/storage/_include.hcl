terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

locals {
  region_vars = read_terragrunt_config(find_in_parent_folders("region.hcl")).locals
}

inputs = {
  bucket_names_private = try(local.region_vars.bucket_names_private, [])
  bucket_names_public  = try(local.region_vars.bucket_names_public, [])
}
