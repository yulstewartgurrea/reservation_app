terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

# root_domain is a global value (aws/accounts/global.hcl) and is already merged
# into inputs by terragrunt_base.hcl, so no per-layer wiring is needed here.
