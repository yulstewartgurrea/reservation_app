terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

locals {
  region_vars = read_terragrunt_config(find_in_parent_folders("region.hcl")).locals
}

dependencies {
  paths = ["../networking", "../ecr", "../parameters", "../rds", "../redis"]
}

dependency "networking" {
  config_path = "../networking"

  mock_outputs = {
    vpc = {
      vpc_id          = "vpc-00000000"
      vpc_cidr_block  = "10.0.0.0/16"
      private_subnets = ["subnet-00000001", "subnet-00000002"]
      public_subnets  = ["subnet-00000003", "subnet-00000004"]
    }
  }
}

inputs = merge(
  {
    vpc = dependency.networking.outputs.vpc

    create_external_load_balancer = false
    create_internal_load_balancer = true

    # WebSocket ALB is opt-in (requires a domain + ACM cert). Wire empty inputs
    # so the ecs module skips the websocket attachment block.
    websocket_target_group_arn      = ""
    websocket_alb_security_group_id = ""

    defaults = {
      cluster_name = "ecs-01"
      services = {
        cpu         = 256
        memory      = 512
        secrets     = []
        environment = []
        port_mappings = [
          {
            name          = "http"
            containerPort = 80
            hostPort      = 80
            protocol      = "tcp"
            app_protocol  = "http"
          }
        ]
        runtime_platform = {
          operating_system_family = "LINUX"
          cpu_architecture        = "X86_64"
        }
      }
    }
  },
  local.region_vars.ecs_services,
  local.region_vars.ecs_cluster,
)
