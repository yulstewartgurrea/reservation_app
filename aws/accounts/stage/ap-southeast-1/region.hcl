locals {
  # ---------------------------------------------------------------------------
  # Environment
  # ---------------------------------------------------------------------------
  env          = "stage"
  env_type     = "non-prod"
  aws_region   = "ap-southeast-1"
  project_name = "reservation"
  az_number    = 2

  global_vars = read_terragrunt_config(find_in_parent_folders("global.hcl")).locals
  account_id  = local.global_vars.stage_account_id

  # ---------------------------------------------------------------------------
  # SES (transactional email — signup OTPs, password resets, booking emails)
  # ---------------------------------------------------------------------------
  # While in SES sandbox (the default until you request production access),
  # this address is both the only sender AND one of the only recipients you can
  # send to. Add more recipients to `additional_verified_emails` for testing.
  verified_email             = "yulgurz@gmail.com"
  additional_verified_emails = []
  from_email_display         = "BookMe <yulgurz@gmail.com>"
  write_smtp_creds_to_ssm    = true

  # ---------------------------------------------------------------------------
  # VPC
  # ---------------------------------------------------------------------------
  cidr                     = "10.244.0.0/20"
  enable_nat_gateway       = true
  single_nat_gateway       = true
  private_subnets_newbits  = 2
  public_subnets_newbits   = 2
  database_subnets_newbits = 2
  vpce_list                = ["logs", "ecr.api", "ecr.dkr", "s3"]

  # ---------------------------------------------------------------------------
  # ECS
  # ---------------------------------------------------------------------------
  ecs_cluster_name = "ecs-${local.project_name}-${local.env}"

  ecs_cluster = {
    cloudwatch_log_group_retention_in_days = 7
    enable_service_connect                 = false
    default_capacity_provider_strategy = {
      FARGATE = {
        weight = 100
      }
    }
  }

  base_image_name = "${local.project_name}/${local.env}/api"
  # CI sets API_IMAGE_TAG to the short commit SHA on every deploy. Local applies fall back to
  # `:latest` (which the first apply uses to bootstrap before CI is wired up).
  api_image_tag   = get_env("API_IMAGE_TAG", "latest")
  container_image = "${local.account_id}.dkr.ecr.${local.aws_region}.amazonaws.com/${local.base_image_name}:${local.api_image_tag}"

  # S3 bucket holding user uploads (avatars, shop/service photos, chat
  # attachments). Defined here so both the task IAM policy and the SSM
  # parameter reference the same name.
  media_bucket_name = "s3-${local.project_name}-${local.env}-media"

  # Common ECS task IAM policies — read app secrets/params from /reservation/* in this account.
  tasks_iam_role_statements = [
    {
      actions   = ["ssm:GetParameters", "ssm:GetParameter", "ssm:GetParametersByPath"]
      resources = ["arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/*"]
      effect    = "Allow"
      sid       = "SSMParameterStore"
    },
    {
      actions   = ["kms:Decrypt"]
      resources = ["*"]
      effect    = "Allow"
      sid       = "KMSDecryptSecureStrings"
    },
    # Django uses these to upload, fetch, presign and delete user media.
    # ListBucket is required by django-storages' file_overwrite=False check
    # (it lists to confirm whether a key already exists before saving).
    {
      actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      resources = ["arn:aws:s3:::${local.media_bucket_name}/*"]
      effect    = "Allow"
      sid       = "S3MediaObjects"
    },
    {
      actions   = ["s3:ListBucket"]
      resources = ["arn:aws:s3:::${local.media_bucket_name}"]
      effect    = "Allow"
      sid       = "S3MediaListBucket"
    }
  ]

  # Env that's the same for every container.
  common_environment = [
    { name = "AWS_REGION", value = local.aws_region },
    { name = "DJANGO_SETTINGS_MODULE", value = "config.settings" },
  ]

  # Secrets pulled from SSM into env vars at task start.
  # NOTE: the values themselves live under /reservation/stage/* and are created by
  # the rds, redis, and parameters layers.
  common_secrets = [
    # Database (created by the rds layer)
    { name = "POSTGRES_DB", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/rds_db_name" },
    { name = "POSTGRES_USER", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/rds_username" },
    { name = "POSTGRES_PASSWORD", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/rds_password" },
    { name = "POSTGRES_HOST", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/rds_host" },
    { name = "POSTGRES_PORT", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/rds_port" },

    # Redis (created by the redis layer; rediss:// URL with auth token)
    { name = "REDIS_URL", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/redis_url" },
    { name = "CELERY_BROKER_URL", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/redis_url" },
    { name = "CELERY_RESULT_BACKEND", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/redis_url" },

    # App config (created by the parameters layer from env.yaml)
    { name = "DJANGO_SECRET_KEY", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/DJANGO_SECRET_KEY" },
    { name = "DJANGO_DEBUG", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/DJANGO_DEBUG" },
    { name = "DJANGO_ALLOWED_HOSTS", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/DJANGO_ALLOWED_HOSTS" },
    { name = "CORS_ALLOWED_ORIGINS", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/CORS_ALLOWED_ORIGINS" },
    { name = "FRONTEND_URL", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/FRONTEND_URL" },

    { name = "DEFAULT_COMMISSION_RATE", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/DEFAULT_COMMISSION_RATE" },
    { name = "DEFAULT_CANCELLATION_WINDOW_HOURS", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/DEFAULT_CANCELLATION_WINDOW_HOURS" },
    { name = "STRIKE_LIMIT", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/STRIKE_LIMIT" },
    { name = "STRIKE_WINDOW_DAYS", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/STRIKE_WINDOW_DAYS" },

    # Email — created and populated by the `ses` layer at /reservation/<env>/ses/*.
    # Apply the ses layer BEFORE re-applying ecs after a fresh checkout (otherwise
    # the task definition will fail to resolve these secrets).
    { name = "EMAIL_BACKEND", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/ses/email_backend" },
    { name = "EMAIL_HOST", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/ses/smtp_host" },
    { name = "EMAIL_PORT", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/ses/smtp_port" },
    { name = "EMAIL_HOST_USER", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/ses/smtp_username" },
    { name = "EMAIL_HOST_PASSWORD", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/ses/smtp_password" },
    { name = "EMAIL_USE_TLS", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/ses/email_use_tls" },
    { name = "DEFAULT_FROM_EMAIL", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/ses/default_from_email" },

    { name = "PAYMONGO_SECRET_KEY", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/PAYMONGO_SECRET_KEY" },
    { name = "PAYMONGO_PUBLIC_KEY", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/PAYMONGO_PUBLIC_KEY" },
    { name = "PAYMONGO_WEBHOOK_SECRET", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/PAYMONGO_WEBHOOK_SECRET" },

    # Media — when set, Django uses S3Storage + presigned URLs.
    { name = "AWS_STORAGE_BUCKET_NAME", valueFrom = "arn:aws:ssm:${local.aws_region}:${local.account_id}:parameter/${local.project_name}/${local.env}/AWS_STORAGE_BUCKET_NAME" },
  ]

  runtime_platform_x86 = {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  ecs_services = {
    "svc-ecs-${local.project_name}-${local.env}-api" = {
      cpu                               = 512
      memory                            = 1024
      create_internal_load_balancer     = true
      health_check_grace_period_seconds = 120

      tasks_iam_role_statements = local.tasks_iam_role_statements

      container_definitions = {
        "image-${local.project_name}-${local.env}-api" = {
          image             = local.container_image
          runtime_platform  = local.runtime_platform_x86
          working_directory = "/app"
          entrypoint        = ["sh", "-c"]
          command = [
            "python manage.py migrate --noinput && python manage.py seed_categories && daphne -b 0.0.0.0 -p 8000 config.asgi:application"
          ]
          portMappings = [
            {
              name          = "http-port"
              containerPort = 8000
              hostPort      = 8000
              protocol      = "tcp"
            }
          ]
          environment = local.common_environment
          secrets     = local.common_secrets
        }
      }

      internal_load_balancer = {
        path_pattern = ["*"]
        priority     = 1
        target_group = {
          port                 = 8000
          deregistration_delay = 60
          health_check = {
            path    = "/health/"
            matcher = "200"
          }
        }
        container_port = 8000
      }
    }

    "svc-ecs-${local.project_name}-${local.env}-celery-worker" = {
      cpu                           = 512
      memory                        = 1024
      create_internal_load_balancer = false

      tasks_iam_role_statements = local.tasks_iam_role_statements

      container_definitions = {
        "image-${local.project_name}-${local.env}-celery-worker" = {
          image             = local.container_image
          runtime_platform  = local.runtime_platform_x86
          working_directory = "/app"
          command           = ["celery", "-A", "config", "worker", "--loglevel=info", "--concurrency=4"]
          environment       = local.common_environment
          secrets           = local.common_secrets
        }
      }
    }

    "svc-ecs-${local.project_name}-${local.env}-celery-beat" = {
      cpu                           = 256
      memory                        = 512
      autoscaling_max_capacity      = 1
      create_internal_load_balancer = false

      tasks_iam_role_statements = local.tasks_iam_role_statements

      container_definitions = {
        "image-${local.project_name}-${local.env}-celery-beat" = {
          image             = local.container_image
          runtime_platform  = local.runtime_platform_x86
          working_directory = "/app"
          command           = ["celery", "-A", "config", "beat", "--loglevel=info"]
          environment       = local.common_environment
          secrets           = local.common_secrets
        }
      }
    }
  }

  # ---------------------------------------------------------------------------
  # ECR
  # ---------------------------------------------------------------------------
  ecr_settings = {
    repositories = {
      "${local.base_image_name}" = {
        image_tag_mutability = "MUTABLE"
        force_delete         = false
      }
    }
  }

  # ---------------------------------------------------------------------------
  # RDS (PostgreSQL 17 — Postgres 16.4 is no longer available in ap-southeast-1;
  # 17.x is forward-compatible with the local docker-compose `postgres:16-alpine`
  # for Django's purposes — only the engine major matters for app behavior.)
  # ---------------------------------------------------------------------------
  create_rds    = true
  create_aurora = false
  rds_settings = {
    name                                  = "rds-${local.project_name}-${local.env}"
    engine                                = "postgres"
    engine_version                        = "17.4"
    family                                = "postgres17"
    major_engine_version                  = "17"
    instance_class                        = "db.t4g.micro"
    storage_type                          = "gp3"
    allocated_storage                     = 20
    max_allocated_storage                 = 100
    db_name                               = "reservation"
    username                              = "db_admin"
    port                                  = 5432
    multi_az                              = false
    backup_window                         = "18:00-21:00"   # UTC — quiet for PH (02:00-05:00 PHT)
    backup_retention_period               = 7
    maintenance_window                    = "Sun:21:00-Sun:23:00"
    enabled_cloudwatch_logs_exports       = ["postgresql"]
    performance_insights_enabled          = false
    performance_insights_retention_period = 7
    create_monitoring_role                = true
    parameters                            = []
    deletion_protection                   = false
    storage_encrypted                     = true
  }

  # ---------------------------------------------------------------------------
  # Redis (used by Channels and Celery)
  # ---------------------------------------------------------------------------
  create_redis = true
  redis_settings = {
    name                       = "redis-${local.project_name}-${local.env}"
    engine                     = "redis"
    engine_version             = "7.1"
    node_type                  = "cache.t3.micro"
    cluster_mode_enabled       = false
    num_cache_clusters         = 1
    num_node_groups            = 1
    maintenance_window         = "sun:20:00-sun:22:00"
    automatic_failover_enabled = false
    create_parameter_group     = true
    parameter_group_family     = "redis7"
    parameters                 = {}
    at_rest_encryption_enabled = true
    transit_encryption_enabled = true
    port                       = 6379
  }

  # ---------------------------------------------------------------------------
  # S3 (media uploads — avatars, shop photos, service images, chat attachments)
  # ---------------------------------------------------------------------------
  # Stays private — the backend signs every read URL (6-hour expiry) so no
  # public ACL / bucket policy is needed. See settings.py STORAGES["default"].
  bucket_names_private = [
    local.media_bucket_name,
  ]
  bucket_names_public = []

  # ---------------------------------------------------------------------------
  # Frontend hosting (S3 + CloudFront for the Next.js static export)
  # ---------------------------------------------------------------------------
  frontend_bucket_name      = "s3-${local.project_name}-${local.env}-frontend"
  frontend_cloudfront_alias = []   # add custom domains here when ACM cert exists
  frontend_price_class      = "PriceClass_100"  # NA + EU only (cheapest tier)

  # GitHub repo allowed to assume the deploy role via OIDC.
  github_repo = "yulstewartgurrea/reservation_app"
  # GitHub Environments allowed to deploy here. The workflow sets `environment: staging`,
  # so the OIDC token's sub claim becomes `repo:OWNER/REPO:environment:staging` — we match on that.
  github_environments = ["staging"]
  # The OIDC provider for token.actions.githubusercontent.com already exists in this AWS account
  # (likely from a previous project). Set to true on a fresh account where no provider exists.
  create_oidc_provider = false

  # ---------------------------------------------------------------------------
  # Parameters & secrets (read from parameters/env.yaml)
  # Everything is stored in SSM Parameter Store — secret_parameters use SecureString.
  # ---------------------------------------------------------------------------
  env_kv = yamldecode(file("${get_terragrunt_dir()}/parameters/env.yaml"))

  ssm_parameters = concat(
    [for k, v in lookup(local.env_kv, "ssm_parameters", {}) : {
      name  = "/${local.project_name}/${local.env}/${k}"
      value = tostring(v)
      type  = "String"
    }],
    [for k, v in lookup(local.env_kv, "secret_parameters", {}) : {
      name  = "/${local.project_name}/${local.env}/${k}"
      value = tostring(v)
      type  = "SecureString"
    }]
  )

  secret_parameters = []
}
