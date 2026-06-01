include "base" {
  path = find_in_parent_folders("terragrunt_base.hcl")
}

include "layer" {
  path = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}/_include.hcl"
}

# Prod reuses the OIDC provider that stage created.
# Workflow:
#   1) Apply stage first. Grab its `github_oidc_provider_arn` output.
#   2) Paste it below.
#   3) Apply prod.
inputs = {
  github_oidc_provider_arn = "arn:aws:iam::936146782254:oidc-provider/token.actions.githubusercontent.com"
}
