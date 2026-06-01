include "base" {
  path = find_in_parent_folders("terragrunt_base.hcl")
}

include "layer" {
  path = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}/_include.hcl"
}

# Stage creates the account-level GitHub OIDC provider. Prod reuses it (see the prod
# instance's `github_oidc_provider_arn` input — set it to the ARN that stage outputs).
