terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

locals {
  region_vars = read_terragrunt_config(find_in_parent_folders("region.hcl")).locals
  api_service = "svc-ecs-${local.region_vars.project_name}-${local.region_vars.env}-api"
}

# The ecs layer's internal ALB is the backend origin for CloudFront's /api/* and /ws/*
# behaviors. Mocks let the frontend_hosting layer plan/apply on a clean account before
# ecs has been applied (it just skips the backend behaviors).
dependency "ecs" {
  config_path = "../ecs"

  mock_outputs = {
    lb_internal = {}
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan", "init"]
}

inputs = {
  frontend_bucket_name      = local.region_vars.frontend_bucket_name
  frontend_cloudfront_alias = try(local.region_vars.frontend_cloudfront_alias, [])
  frontend_price_class      = try(local.region_vars.frontend_price_class, "PriceClass_100")
  github_repo               = local.region_vars.github_repo
  github_environments       = local.region_vars.github_environments

  backend_alb_arn      = try(dependency.ecs.outputs.lb_internal[local.api_service].arn, "")
  backend_alb_dns_name = try(dependency.ecs.outputs.lb_internal[local.api_service].dns_name, "")
}
