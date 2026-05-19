include "base" {
  path = find_in_parent_folders("terragrunt_base.hcl")
}

include "layer" {
  path = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}/_include.hcl"
}

# The bookme.ph hosted zone is account-global (single-account model). It lives
# under stage — the live account — exactly like the account-level GitHub OIDC
# provider. Both stage AND prod frontend_hosting read this one zone.
