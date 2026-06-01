# AWS-managed prefix list of CloudFront origin-facing IPs. CloudFront VPC Origin
# requests reach the internal ALB sourced from these IPs (not the VPC origin
# ENI's private IP), so the ALB SG must allow this prefix list — otherwise every
# CloudFront → /api/* call hits the 30s origin timeout and returns 504.
data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

################################################################################
# Cluster
################################################################################
module "ecs_cluster" {
  source  = "terraform-aws-modules/ecs/aws"
  version = "~> 6.0"

  cluster_name                           = var.ecs_cluster_name
  cloudwatch_log_group_retention_in_days = try(var.ecs_cluster.cloudwatch_log_group_retention_in_days, 30)

  cluster_configuration = {
    execute_command_configuration = {
      logging = "OVERRIDE"
      log_configuration = {
        cloud_watch_log_group_name = "/aws/ecs/${var.ecs_cluster_name}"
      }
    }
  }

  default_capacity_provider_strategy = try(var.ecs_cluster.default_capacity_provider_strategy, {
    FARGATE = { weight = 100 }
  })
}

################################################################################
# Internal ALB (one per ECS layer; multiple services can attach via target groups)
################################################################################
module "alb_internal" {
  source  = "terraform-aws-modules/alb/aws"
  version = "~> 9.0"

  for_each = var.ecs_services

  create   = try(each.value.create_internal_load_balancer, var.create_internal_load_balancer)
  internal = true

  name                           = "lb-${var.project_name}-${var.env}-internal"
  load_balancer_type             = "application"
  enable_deletion_protection     = false
  vpc_id                         = try(var.vpc.vpc_id, null)
  subnets                        = try(var.vpc.private_subnets, [])
  create_security_group          = true
  security_group_use_name_prefix = false
  security_group_name            = local.internal_alb_security_group_name
  security_group_description     = "Internal ALB security group"

  security_group_ingress_rules = {
    ingress_vpc_cidr_http = {
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      description = "HTTP from VPC"
      cidr_ipv4   = var.vpc.vpc_cidr_block
    }
    ingress_cloudfront_origin_facing = {
      from_port      = 80
      to_port        = 80
      ip_protocol    = "tcp"
      description    = "HTTP from CloudFront origin-facing (VPC origins)"
      prefix_list_id = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id
    }
  }

  security_group_egress_rules = {
    egress_all = {
      ip_protocol = "-1"
      cidr_ipv4   = "0.0.0.0/0"
    }
  }

  listeners = {
    http_listener = {
      port               = 80
      protocol           = "HTTP"
      target_group_index = 0

      fixed_response = {
        content_type = "application/json"
        message_body = "{\"statusCode\":403,\"message\":\"Access denied\"}"
        status_code  = 403
      }

      rules = [for key, value in var.ecs_services : {
        actions = [{
          type             = "forward"
          target_group_key = key
        }]
        conditions = [{
          path_pattern = { values = value.internal_load_balancer.path_pattern }
        }]
        priority = value.internal_load_balancer.priority
      } if can(value.internal_load_balancer.priority)]
    }
  }

  target_groups = {
    for key, value in var.ecs_services : key => {
      name                 = "tg-${key}"
      backend_protocol     = "HTTP"
      backend_port         = value.internal_load_balancer.target_group.port
      target_type          = "ip"
      create_attachment    = false
      deregistration_delay = try(value.internal_load_balancer.target_group.deregistration_delay, 60)
      health_check         = try(value.internal_load_balancer.target_group.health_check, {})
    } if try(value.create_internal_load_balancer, var.create_internal_load_balancer)
  }
}

################################################################################
# ECS Services
################################################################################
module "ecs_service" {
  source  = "terraform-aws-modules/ecs/aws//modules/service"
  version = "~> 6.0"

  for_each = var.ecs_services

  name        = each.key
  cluster_arn = module.ecs_cluster.cluster_arn

  cpu           = try(each.value.cpu, 512)
  memory        = try(each.value.memory, 1024)
  desired_count = try(each.value.desired_count, 1)

  runtime_platform = try(each.value.runtime_platform, {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  })

  health_check_grace_period_seconds = try(each.value.health_check_grace_period_seconds, 30)
  enable_execute_command            = try(each.value.enable_execute_command, true)

  autoscaling_min_capacity = try(each.value.autoscaling_min_capacity, 1)
  autoscaling_max_capacity = try(each.value.autoscaling_max_capacity, 3)

  autoscaling_policies = try(each.value.autoscaling_max_capacity, 3) > 1 ? {
    cpu = {
      policy_type = "TargetTrackingScaling"
      target_tracking_scaling_policy_configuration = {
        predefined_metric_specification = { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
        target_value                    = 75.0
        scale_in_cooldown               = 150
        scale_out_cooldown              = 60
      }
    }
    memory = {
      policy_type = "TargetTrackingScaling"
      target_tracking_scaling_policy_configuration = {
        predefined_metric_specification = { predefined_metric_type = "ECSServiceAverageMemoryUtilization" }
        target_value                    = 80.0
        scale_in_cooldown               = 150
        scale_out_cooldown              = 60
      }
    }
  } : {}

  container_definitions = { for key, value in each.value.container_definitions :
    key => {
      essential                 = true
      image                     = try(value.image, "nginx:latest")
      portMappings              = try(value.portMappings, [])
      readonlyRootFilesystem    = try(value.readonly_root_filesystem, false)
      entrypoint                = try(value.entrypoint, [])
      command                   = try(value.command, [])
      environment               = try(value.environment, [])
      workingDirectory          = try(value.working_directory, null)
      secrets                   = try(value.secrets, [])
      cloudwatch_log_group_name = "/ecs/${var.ecs_cluster_name}/${key}"
    }
  }

  load_balancer = merge(
    length(try(each.value.internal_load_balancer, {})) > 0 && try(each.value.create_internal_load_balancer, var.create_internal_load_balancer) ? {
      internal = {
        target_group_arn = module.alb_internal[each.key].target_groups[each.key].arn
        container_name   = try(each.value.internal_load_balancer.container_name, keys(each.value.container_definitions)[0])
        container_port   = try(each.value.internal_load_balancer.container_port, 80)
      }
    } : {},
    try(each.value.websocket_load_balancer, false) && length(var.websocket_target_group_arn) > 0 ? {
      websocket = {
        target_group_arn = var.websocket_target_group_arn
        container_name   = keys(each.value.container_definitions)[0]
        container_port   = 8000
      }
    } : {},
  )

  # Task execution role
  create_task_exec_iam_role          = true
  task_exec_iam_role_name            = "role-${each.key}-task-exec"
  task_exec_iam_role_use_name_prefix = false
  task_exec_iam_role_description     = "ECS ${each.key} task execution role"
  task_exec_iam_role_policies = try(each.value.task_exec_iam_role_policies, {
    ECS = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    SSM = "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
  })
  task_exec_iam_statements = try(each.value.task_exec_iam_statements, [])

  # Task role
  create_tasks_iam_role          = true
  tasks_iam_role_name            = "role-${each.key}-task"
  tasks_iam_role_use_name_prefix = false
  tasks_iam_role_description     = "ECS ${each.key} task IAM role"
  tasks_iam_role_policies = try(each.value.tasks_iam_role_policies, {
    SSM = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  })
  tasks_iam_role_statements = try(each.value.tasks_iam_role_statements, [])

  subnet_ids = var.vpc.private_subnets

  create_security_group          = true
  security_group_use_name_prefix = true
  security_group_ingress_rules = merge(
    length(try(each.value.internal_load_balancer, {})) > 0 && try(each.value.create_internal_load_balancer, var.create_internal_load_balancer) ? {
      alb_internal_ingress = {
        type                         = "ingress"
        from_port                    = try(each.value.internal_load_balancer.container_port, 80)
        to_port                      = try(each.value.internal_load_balancer.container_port, 80)
        protocol                     = "tcp"
        description                  = "From internal ALB"
        referenced_security_group_id = module.alb_internal[each.key].security_group_id
      }
    } : {},
    try(each.value.websocket_load_balancer, false) && length(var.websocket_alb_security_group_id) > 0 ? {
      websocket_ingress = {
        type                         = "ingress"
        from_port                    = 8000
        to_port                      = 8000
        protocol                     = "tcp"
        description                  = "From WebSocket ALB"
        referenced_security_group_id = var.websocket_alb_security_group_id
      }
    } : {},
  )
  security_group_egress_rules = {
    egress_all = {
      ip_protocol = "-1"
      cidr_ipv4   = "0.0.0.0/0"
    }
  }
}
