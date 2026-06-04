# AWS infrastructure — reference documentation

Companion reference to [aws/README.md](README.md). The README is the quick-start; this document
explains how the stack is built, why it's structured the way it is, and how to operate it day-to-day.

> Scope: this Terraform deploys the **Django backend** ([backend/](../backend/)) plus its
> supporting AWS services (ECS, RDS, ElastiCache, SSM, SES, S3 media), and the **Next.js
> frontend** as a static export to S3 + CloudFront (the `frontend_hosting` layer). CloudFront
> serves the SPA and reverse-proxies `/api/*` + `/ws/*` to the internal ALB, so the app is
> same-origin. Both `stage` and `prod` environments are live.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Tooling: Terraform + Terragrunt](#2-tooling-terraform--terragrunt)
3. [Repository layout](#3-repository-layout)
4. [Layer reference](#4-layer-reference)
5. [Configuration reference](#5-configuration-reference)
6. [The boot path: how an HTTP request reaches Django](#6-the-boot-path-how-an-http-request-reaches-django)
7. [How secrets and config flow into containers](#7-how-secrets-and-config-flow-into-containers)
8. [Operational runbook](#8-operational-runbook)
9. [Security model](#9-security-model)
10. [Cost breakdown](#10-cost-breakdown)
11. [Troubleshooting](#11-troubleshooting)
12. [Production deploy runbook](#12-production-deploy-runbook)
13. [CI/CD with GitHub Actions](#13-cicd-with-github-actions)
14. [Extending the stack](#14-extending-the-stack)

---

## 1. Architecture overview

```
                                ┌──────────────────────────────────────────┐
                                │            Internet                       │
                                └────────────────┬─────────────────────────┘
                                                 │
                                  (public via CloudFront — staging.bookme.ph
                                   for stage, bookme.ph + www.bookme.ph for prod)
                                                 │
   ╔══════════════════════════════════════════════════════════════════════╗
   ║   AWS account · region: ap-southeast-1 (Singapore)                    ║
   ║                                                                       ║
   ║   ┌───────────── VPC 10.244.0.0/20 ─────────────────────────────┐    ║
   ║   │                                                              │    ║
   ║   │  Public subnets (2 AZs)         Private subnets (2 AZs)      │    ║
   ║   │  ┌──────────────┐               ┌──────────────────────────┐ │    ║
   ║   │  │ NAT Gateway  ├───┐           │ Internal ALB             │ │    ║
   ║   │  └──────────────┘   │           │ (HTTP :80 → port 8000)   │ │    ║
   ║   │                     │           └──────────────┬───────────┘ │    ║
   ║   │                     │                          │             │    ║
   ║   │                     │           ┌──────────────┴───────────┐ │    ║
   ║   │                     │           │ ECS Fargate              │ │    ║
   ║   │                     │           │  · api  (Daphne :8000)   │ │    ║
   ║   │                     │           │  · celery-worker         │ │    ║
   ║   │                     │           │  · celery-beat           │ │    ║
   ║   │                     │           └────┬────────────┬────────┘ │    ║
   ║   │                     │                │            │          │    ║
   ║   │                     │   Database subnets (2 AZs)  │          │    ║
   ║   │                     │   ┌─────────────────┐       │          │    ║
   ║   │                     │   │ RDS Postgres 17 │◀──────┘          │    ║
   ║   │                     │   └─────────────────┘                  │    ║
   ║   │                     │   ┌─────────────────┐                  │    ║
   ║   │                     │   │ ElastiCache     │◀─────────────────┘    ║
   ║   │                     │   │ Redis 7.1 (TLS) │                  │    ║
   ║   │                     │   └─────────────────┘                  │    ║
   ║   │                     │                                        │    ║
   ║   │                     │   VPC endpoints: logs, ecr.api,        │    ║
   ║   │                     │   ecr.dkr, s3 (Gateway)                │    ║
   ║   │                     │                                        │    ║
   ║   │                     └──────────────────────────────────────► │    ║
   ║   │                                  Outbound to ECR, S3, SSM, … │    ║
   ║   └──────────────────────────────────────────────────────────────┘    ║
   ║                                                                       ║
   ║   ECR (image registry)    SSM (config + secrets)   S3 (media uploads) ║
   ║   ┌──────────────────┐    ┌────────────────────┐   ┌────────────────┐ ║
   ║   │ reservation/     │    │ /reservation/      │   │ s3-reservation │ ║
   ║   │ <env>/api:<tag>  │    │ <env>/* (KMS)      │   │ -<env>-media   │ ║
   ║   └──────────────────┘    └────────────────────┘   └────────────────┘ ║
   ╚══════════════════════════════════════════════════════════════════════╝
```

Both `stage` and `prod` follow this exact shape in the same AWS account, isolated by VPC CIDR (`10.244.0.0/20` vs `10.245.0.0/20`), resource-name prefix (`reservation-stage-*` vs `reservation-prod-*`), and IAM-scoped SSM parameter paths (`/reservation/stage/*` vs `/reservation/prod/*`). See § 12 [Production deploy runbook](#12-production-deploy-runbook) for the prod-specific sizing (Multi-AZ RDS, Redis failover, IMMUTABLE ECR).

### Why this shape

| Decision | Reason |
|---|---|
| **One internal ALB, three ECS services** | API needs an HTTP entry point; Celery worker/beat don't. Same image for all three keeps the deploy story simple. |
| **Internal ALB + CloudFront VPC Origin** | The ALB stays VPC-internal; CloudFront reaches it via a VPC Origin and terminates TLS at the edge using ACM certs. Same-origin `/api/*` + `/ws/*` behaviours mean no CORS and no per-domain frontend rebuild. |
| **Single NAT Gateway** (both envs) | Two NATs cost double for ~zero benefit at current traffic. Both envs accept this SPOF for outbound from private subnets. Flip `single_nat_gateway = false` later if outbound resilience becomes critical. |
| **VPC endpoints for ECR/S3/Logs** | Avoids paying NAT egress on every image pull and log shipment. |
| **db.t4g.micro + cache.t3.micro** | Cheap stage profile. Postgres `t4g.micro` is ARM-based; pairs well with the existing Django image. |
| **Postgres 17.4** | AWS deprecated 16.4 in `ap-southeast-1`; 17 is forward-compatible with the local `postgres:16-alpine` for Django's purposes (engine major is what matters for app behavior). |
| **All config in SSM Parameter Store, secrets as SecureString** | Predictable ARN shape (no random suffix like Secrets Manager) → ECS task definitions can reference paths directly. |

---

## 2. Tooling: Terraform + Terragrunt

**Terraform** declares AWS resources. **Terragrunt** is a thin wrapper that:

1. **DRYs the config.** Each environment is a small `terragrunt.hcl` stub that includes a shared
   base; the heavy lifting lives in `region.hcl` (settings) and `layers/*` (modules).
2. **Manages remote state.** Auto-creates S3 keys under
   `s3://terraform-states-<account-id>-<region>/<layer>/terraform.tfstate`.
3. **Handles dependencies between layers.** ECS reads outputs from networking, RDS, Redis without
   you wiring data sources by hand.
4. **Generates boilerplate.** Provider blocks, version constraints, and variable declarations are
   stamped into each layer at apply-time so layer modules stay clean.

### When you run `terragrunt run-all apply`

```
terragrunt walks the directory tree → finds 7 layers under stage/ap-southeast-1/
   │
   ├─ Reads dependencies → builds DAG:
   │    networking
   │       ├─ rds, redis, ecr (in parallel)
   │       │     └─ parameters (reads env.yaml)
   │       │           └─ ecs (final, depends on everything)
   │       └─ storage (parallel, no deps)
   │
   ├─ For each layer:
   │   1. Generates _providers.tf, _variables.tf, _versions_override.tf, _backend.tf
   │   2. Calls `terraform init` (pulls modules from registry → .terragrunt-cache/)
   │   3. Calls `terraform apply` (sends inputs via .auto.tfvars.json)
   │   4. Stores state in S3
   │
   └─ Walks layers in dependency order; parallelizes where safe.
```

---

## 3. Repository layout

```
aws/
├── README.md                       # operational quick-start
├── DOCUMENTATION.md                # this file
├── .gitignore                      # .terraform/, .terragrunt-cache/, *.tfstate, etc.
│
├── accounts/                       # ── per-account / per-region config ──
│   ├── global.hcl                  #    account IDs, AWS profile names (USER FILLS IN)
│   ├── terragrunt_base.hcl         #    shared backend + provider/variable codegen
│   │
│   ├── _common/                    #    generated into every layer at apply-time
│   │   ├── providers.tf            #      → default + us-east-1 AWS providers
│   │   ├── variables.tf            #      → aws_region, account_id, profile_name, common_tags
│   │   └── versions_override.tf    #      → terraform >= 1.5, aws >= 5.0
│   │
│   ├── stage/                      #    stage environment
│   │   ├── account.hcl             #      → reads account_id + profile_name from global.hcl
│   │   └── ap-southeast-1/         #      region: Singapore (lowest latency to PH)
│   │       ├── region.hcl          #      ★ the meaty config — ECS services, RDS, Redis, etc.
│   │       │
│   │       ├── dns/terragrunt.hcl           # ★ the single bookme.ph Route 53 zone (account-global)
│   │       ├── networking/terragrunt.hcl   # stub: include base + layer
│   │       ├── ecr/terragrunt.hcl
│   │       ├── parameters/
│   │       │   ├── env.yaml                # ★ app config + secrets, by key
│   │       │   └── terragrunt.hcl
│   │       ├── rds/terragrunt.hcl
│   │       ├── redis/terragrunt.hcl
│   │       ├── ecs/terragrunt.hcl
│   │       ├── storage/terragrunt.hcl
│   │       └── frontend_hosting/terragrunt.hcl  # S3 + CloudFront for Next.js static export
│   │
│   └── prod/                       #    prod environment (live — full stack)
│       ├── account.hcl
│       └── ap-southeast-1/
│           ├── region.hcl
│           ├── ci/terragrunt.hcl
│           ├── networking/terragrunt.hcl
│           ├── ecr/terragrunt.hcl
│           ├── parameters/
│           │   ├── env.yaml
│           │   └── terragrunt.hcl
│           ├── rds/terragrunt.hcl
│           ├── redis/terragrunt.hcl
│           ├── ses/terragrunt.hcl
│           ├── storage/terragrunt.hcl
│           ├── ecs/terragrunt.hcl
│           └── frontend_hosting/terragrunt.hcl
│           # Note: no `dns/` — the bookme.ph zone is account-global and lives
│           # under stage. Both envs' frontend_hosting layers write records into it.
│
└── layers/                         # ── reusable Terraform modules ──
    ├── dns/                        #    one public Route 53 hosted zone (bookme.ph)
    ├── networking/                 #    VPC + subnets + NAT + VPC endpoints + SGs
    ├── ecr/                        #    ECR repo + lifecycle policy
    ├── parameters/                 #    creates SSM params + Secrets Manager secrets from env.yaml
    ├── rds/                        #    RDS Postgres + SSM params for connection details
    ├── redis/                      #    ElastiCache Redis + SSM params for REDIS_URL
    ├── ecs/                        #    ECS cluster + services + internal ALB + IAM
    ├── storage/                    #    S3 buckets (private + public lists)
    └── frontend_hosting/           #    S3 + CloudFront + OAC + GitHub OIDC deploy role
```

Each layer is a self-contained Terraform module with `_include.hcl` (Terragrunt glue),
`main.tf`, `variables.tf`, and `outputs.tf`.

---

## 4. Layer reference

### `networking`

**Creates**
- VPC (`var.cidr`) with DNS hostnames + DNS support enabled
- Public, private, database subnets across `var.az_number` AZs
- Internet Gateway + NAT Gateway (single or per-AZ via `single_nat_gateway`)
- Route tables wired automatically by `terraform-aws-modules/vpc/aws`
- Optional VPC endpoints (`var.vpce_list`):
  - Interface endpoints for `logs`, `ecr.api`, `ecr.dkr` (and any you add)
  - Gateway endpoint for `s3`

**Key inputs (set in [region.hcl](accounts/stage/ap-southeast-1/region.hcl))**
- `cidr` — VPC CIDR. Default `10.244.0.0/20` for stage; pick a non-overlapping CIDR for prod.
- `az_number` — how many AZs to span. `2` is fine for stage.
- `enable_nat_gateway`, `single_nat_gateway`
- `vpce_list` — interface endpoints to create.

**Outputs**
- `vpc` — full output of the upstream VPC module, used by RDS, Redis, ECS as a dependency.

**Notes**
- Subnets are sized via `cidrsubnets()` in `local.cidrs`. With `/20` and default newbits, you get
  three `/22` blocks (public/private/database), each split into two `/23` AZ chunks.
- Database subnets are created in their own route table — no NAT route — so RDS can't egress.

### `ecr`

**Creates**
- One ECR repo per entry in `var.repositories` (just `reservation/stage/api` today)
- Lifecycle policy: untagged images expire after 14 days
- Image scan-on-push enabled

**Why single-account (vs. Elated's cross-account)** — Elated runs a `shared` AWS account that
publishes images consumed by `prod` / `stage`. For now the reservation app uses one account for
everything; the shared-account split can be added later by reinstating the cross-account policy
block from the Elated baseline.

### `parameters`

**Creates**
- One `aws_ssm_parameter` per entry in [parameters/env.yaml](accounts/stage/ap-southeast-1/parameters/env.yaml)
  - `secret_parameters:` → `type = SecureString`
  - `ssm_parameters:` → `type = String`
- All under the path `/${project_name}/${env}/<KEY>` (e.g. `/reservation/stage/DJANGO_SECRET_KEY`)

**Important: `lifecycle { ignore_changes = [value] }`**
After the first apply, **Terraform stops managing the values** — the parameters are placeholders
that you can update directly:

```bash
aws ssm put-parameter \
  --name /reservation/stage/PAYMONGO_SECRET_KEY \
  --type SecureString \
  --value sk_live_xxxxxxxx \
  --overwrite \
  --region ap-southeast-1 --profile reservation-stage
```

This means **rotating a key doesn't require a Terraform apply.** It also means you can leave
placeholder values in `env.yaml` and never commit real secrets to the repo.

To force Terraform to re-set a value, taint it: `terragrunt taint 'aws_ssm_parameter.this["/reservation/stage/DJANGO_SECRET_KEY"]'`.

### `rds`

**Creates**
- DB security group (Postgres ingress from the VPC CIDR — plus any `db_allowed_cidrs`)
- RDS instance (PostgreSQL via `terraform-aws-modules/rds/aws`)
- Public DB subnet group (only when `rds_publicly_accessible = true`)
- Random 24-char password (no special chars to keep connection strings simple)
- SSM parameters with connection details:
  - `/${project}/${env}/rds_host` (String)
  - `/${project}/${env}/rds_port` (String)
  - `/${project}/${env}/rds_db_name` (String)
  - `/${project}/${env}/rds_username` (String)
  - `/${project}/${env}/rds_password` (SecureString)
  - `/${project}/${env}/rds_connection_url` (SecureString — full `postgresql://...?sslmode=require`)

**Key tuning knobs**
- `multi_az` — `false` for stage. Switch to `true` for prod (~2× cost, ~1× resilience).
- `deletion_protection` — `false` for stage so `destroy` works cleanly. **Set to `true` for prod.**
- `skip_final_snapshot` defaults `true`; flip to `false` and define `final_snapshot_identifier_prefix` for prod.
- `backup_retention_period` — 7 days default.

**Maintenance + backup windows are set in UTC.** `18:00-21:00 UTC` is `02:00-05:00 PHT` — quiet
hours in the Philippines.

**Public access (non-prod convenience)** — `rds_publicly_accessible` + `db_allowed_cidrs` (rds
layer) plus `create_database_internet_gateway_route` (networking layer) let a developer laptop
connect directly. The instance stays in its **original database subnet group** — AWS rejects
moving an existing instance to a different subnet group in the same VPC
(`InvalidVPCNetworkStateFault`), which is why we don't create a separate public subnet group.
Instead the networking layer adds a `0.0.0.0/0 → IGW` route to the database route table and the
rds layer sets `publicly_accessible = true`. **Apply order: networking before rds.** Ingress is
still SG-gated: `concat([vpc_cidr], db_allowed_cidrs)` — keep `db_allowed_cidrs` a tight `/32`
list, never `0.0.0.0/0`. Toggling `publicly_accessible` is an in-place modify (brief blip), not
a replace — always confirm the plan before approving. Prod must keep all three `false`/empty.
Connection recipe is in [README.md → "Connecting to staging Postgres from your laptop"](README.md#connecting-to-staging-postgres-from-your-laptop).

### `redis`

**Creates**
- Redis security group (Redis-tcp ingress from VPC CIDR)
- ElastiCache replication group (single primary, no replicas for stage)
- Random 64-char auth token (`transit_encryption_enabled = true` → REQUIRES auth)
- SSM parameters:
  - `/${project}/${env}/redis_host` (String)
  - `/${project}/${env}/redis_port` (String)
  - `/${project}/${env}/redis_url` (SecureString — `rediss://:<token>@<host>:6379`)

**Note on `rediss://`** — both TLS and the auth token are mandatory because
`transit_encryption_enabled = true`. The Django Channels and Celery libs both speak `rediss://`
out of the box (URL parsing handles it).

### `ecs`

The biggest layer. Creates:
- ECS Fargate cluster (`var.ecs_cluster_name`)
- CloudWatch log group `/aws/ecs/${cluster_name}` with `cloudwatch_log_group_retention_in_days` retention
- Internal ALB (one per ECS layer) — only target groups for services with `internal_load_balancer` defined
- For each entry in `var.ecs_services`:
  - ECS service + task definition
  - Task execution role (pulls images from ECR, reads secrets from SSM)
  - Task IAM role (your app's runtime permissions; you add custom statements via `tasks_iam_role_statements`)
  - Security group for the task (allows ingress from the ALB SG; egress all)
  - Optional auto-scaling on CPU/memory (above 75/80%) — kicks in when `autoscaling_max_capacity > 1`

**Service shape** (each entry in `ecs_services` is a map):

```hcl
"svc-ecs-reservation-stage-api" = {
  cpu                               = 512   # 0.5 vCPU
  memory                            = 1024  # 1 GB
  desired_count                     = 1
  create_internal_load_balancer     = true
  health_check_grace_period_seconds = 120
  tasks_iam_role_statements         = [ ... ]
  container_definitions             = { "<container-name>" = { ... } }
  internal_load_balancer            = { path_pattern, priority, target_group, container_port }
}
```

**Container `secrets` vs. `environment`**
- `environment` = plain key/value injected at task start (e.g. `AWS_REGION`)
- `secrets` = injected at task start by ECS by fetching from SSM/Secrets Manager (e.g. `POSTGRES_PASSWORD`)

The task execution role needs `ssm:GetParameters` on the parameter ARNs plus `kms:Decrypt` for
SecureString values. Both are granted by scoped inline statements in
[aws/layers/ecs/main.tf](layers/ecs/main.tf) — SSM reads are restricted to
`/${project}/${env}/*` (so a stage task can't read prod parameters in our shared-account model)
and KMS Decrypt is gated by a `kms:ViaService = ssm.<region>.amazonaws.com` condition. The
AWS-managed `AmazonECSTaskExecutionRolePolicy` is still attached for the standard ECR-pull +
CloudWatch-Logs grants.

### `storage`

**Creates** — private + public S3 buckets from `bucket_names_private` / `bucket_names_public` lists.
Private buckets get full public-access-block. Both use AES-256 SSE.

Today stage has one private bucket: `s3-reservation-stage-media`. Django is wired to it via
`django-storages[s3]` — see § "Media uploads (S3 + presigned URLs)" right below.

#### Media uploads (S3 + presigned URLs)

User-uploaded files — `User.avatar`, `Shop.image`, `Staff.photo`, `Service.image`,
`Message.attachment` — all flow through Django's default storage. The bucket
stays **fully private**: no public ACL, no public bucket policy, no
CloudFront-OAC. Every read URL is a **presigned GET** signed server-side by the
ECS task's IAM role.

S3 is the **only** storage backend — there is no local-filesystem fallback in
the app code, so misconfiguration fails loudly at startup rather than silently
writing to disposable container disk. Local dev points at the same bucket
using a developer's AWS credentials (or a personal dev bucket); tests stub
storage out with `InMemoryStorage`.

How the wiring works:

| Piece | Where |
|---|---|
| Dependency | `django-storages[s3]` in [backend/requirements.txt](../backend/requirements.txt) |
| Storage backend | `STORAGES["default"]` in [backend/config/settings.py](../backend/config/settings.py) — unconditional `S3Storage`; `AWS_STORAGE_BUCKET_NAME` is required at import time |
| Test override | `InMemoryStorage` in [backend/config/test_settings.py](../backend/config/test_settings.py) — no AWS calls in CI |
| Bucket name → env var | `AWS_STORAGE_BUCKET_NAME` SSM parameter in [parameters/env.yaml](accounts/stage/ap-southeast-1/parameters/env.yaml), pulled into the task via `common_secrets` in [region.hcl](accounts/stage/ap-southeast-1/region.hcl) |
| IAM | `S3MediaObjects` + `S3MediaListBucket` statements in `tasks_iam_role_statements` in [region.hcl](accounts/stage/ap-southeast-1/region.hcl) — scoped to the media bucket only |
| URL lifetime | 6 hours (`querystring_expire = 60 * 60 * 6` in settings.py) — long enough for an open tab, short enough that a leaked URL has limited reach |

To rotate the URL expiry, change `querystring_expire` and redeploy — no infra
change required. To swap to CloudFront-fronted media later (cheaper egress,
shareable per-session signed cookies), keep the bucket private and add a
distribution with an OAC in front of it; the Django side doesn't need to
change because `S3Storage` can be subclassed to swap the URL host.

### `ses`

**Creates (per env)** — verified SES *email* identity for the sender, IAM user with
`ses:SendEmail` / `ses:SendRawEmail`, an IAM access key, and (when
`write_smtp_creds_to_ssm = true`) seven SSM parameters under `/<project>/<env>/ses/*` that the
ECS task reads as the `EMAIL_*` env vars:

| SSM path | ECS env var | Purpose |
|---|---|---|
| `…/ses/email_backend` | `EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` |
| `…/ses/smtp_host` | `EMAIL_HOST` | `email-smtp.<region>.amazonaws.com` |
| `…/ses/smtp_port` | `EMAIL_PORT` | `587` |
| `…/ses/smtp_username` | `EMAIL_HOST_USER` | IAM access key id |
| `…/ses/smtp_password` | `EMAIL_HOST_PASSWORD` | SES SMTPv4-derived password (SecureString) |
| `…/ses/email_use_tls` | `EMAIL_USE_TLS` | `True` |
| `…/ses/default_from_email` | `DEFAULT_FROM_EMAIL` | `BookMe <verified-address>` |

The v4 password derivation is handled by the AWS provider via
`aws_iam_access_key.smtp.ses_smtp_password_v4` — no manual HMAC scripting required.

**Domain identity lives in `dns`, not here.** SES allows only one identity per (account, domain)
and both envs share one AWS account, so the `bookme.ph` domain identity + its DKIM CNAMEs +
DMARC TXT are managed by the `dns` layer (see § `dns` below). Both envs' `ses` layers send
*as* that shared identity (default From: `noreply@bookme.ph`). The per-env `aws_ses_email_identity`
resource is still kept here for legacy reasons (lets you fall back to address-level verification
if the domain identity is ever removed); it's harmless once the domain identity is verified.

**Sandbox vs production.** SES accounts start in sandbox: 200 sends/day, 1 msg/sec, recipients
must also be verified. Add test recipients via `additional_verified_emails` in `region.hcl`.
Click the verification link AWS emails to each address. **Request production access** when ready —
this is an AWS support ticket, no Terraform path. Approval is typically 24–48h. AWS expects DKIM
(`Successful`) and DMARC published before approving, so apply the `dns` layer first.

#### Going to production — runbook (staging + prod)

> **One account, one request.** Production access is a property of the **account + region**, not
> an environment. Stage and prod share the same AWS account (`936146782254`, `ap-southeast-1`), so a
> **single** production-access request lifts **both** out of sandbox at once. There is no separate
> "prod request" later. The only genuinely per-env step is each env's `ses` layer (its own SMTP
> IAM user + creds).

Prerequisites (done once, in the stage `dns` layer): `bookme.ph` domain identity created, DKIM
status `SUCCESS`, DMARC published.

1. **Apply the SES layer for each env** — creates the per-env SMTP IAM user + the `/ses/*` SSM
   creds the ECS task reads. Stage and prod are independent applies:

   ```bash
   cd aws/accounts/stage/ap-southeast-1/ses && terragrunt apply
   cd ../../../prod/ap-southeast-1/ses     && terragrunt apply
   ```

   Verify creds landed (repeat with `prod`):

   ```bash
   aws ssm get-parameters-by-path --path "/reservation/stage/ses" \
     --profile reservation-stage --region ap-southeast-1 \
     --query "Parameters[].Name" --output table
   ```

2. **Request production access (account-wide, run ONCE).** No Terraform resource exists for this —
   the AWS provider doesn't expose it. Use the API (or the SES console → Account dashboard →
   *Request production access*). **Run it against the deploy account** — `--profile reservation-stage`,
   not your default CLI creds:

   ```bash
   aws sesv2 put-account-details \
     --profile reservation-stage \
     --region ap-southeast-1 \
     --mail-type TRANSACTIONAL \
     --website-url "https://bookme.ph" \
     --use-case-description "Transactional email for a service-reservation platform: signup OTP verification, password resets, and booking confirmation/reminder emails to opted-in registered users. Bounces and complaints handled via the SES account-level suppression list." \
     --additional-contact-email-addresses "yulgurz@gmail.com" \
     --production-access-enabled
   ```

   A `ConflictException` on this call means a request **already exists / is under review** — it is
   not an error to fix; you cannot resubmit while one is open. Just wait.

3. **Poll until approved** (~24–48h; AWS may email `yulgurz@gmail.com` for more info):

   ```bash
   aws sesv2 get-account --profile reservation-stage --region ap-southeast-1 \
     --query '{Prod:ProductionAccessEnabled, Max24h:SendQuota.Max24HourSend, Rate:SendQuota.MaxSendRate}' \
     --output table
   ```

   Live when `Prod: True` and the quota rises above `200 / 1`.

4. **Tighten DMARC** (optional, after prod access + confirming real sends are DKIM-aligned). The
   `dns` layer now publishes `p=quarantine`; bump to `p=reject` in
   [aws/layers/dns/main.tf](../aws/layers/dns/main.tf) when ready, then re-apply the stage `dns` dir.

**Account gotcha.** Terragrunt assumes a role into the deploy account (`936146782254`) via the
`reservation-stage` profile. A bare `aws …` command uses your *default* credentials, which may be a
different account — every SES/SSM/IAM check above must pass `--profile reservation-stage` or it will
silently report an unrelated account as empty.

**Apply order matters.** `ses` must apply before `ecs` (or before any `ecs` re-apply) — the ECS
task's `secrets` block references the `/ses/*` SSM paths and will fail to start if they don't
exist. See README "SES (transactional email) setup".

### `dns`

**Creates** — ONE public Route 53 hosted zone for the registered domain `bookme.ph` (bought at [dot.ph](https://www.dot.ph)), plus the **account-wide SES domain identity** (`bookme.ph`), its 3 DKIM CNAMEs, and a baseline DMARC TXT.

Single-account model, so a single zone serves every environment; each env's `frontend_hosting` layer writes its own ACM-validation + alias records into it:

| Hostname | Distribution |
|---|---|
| `staging.bookme.ph` | stage CloudFront |
| `bookme.ph`, `www.bookme.ph` | prod CloudFront |

The zone lives under **stage** (`accounts/stage/ap-southeast-1/dns/`) — the live account — exactly like the account-level GitHub OIDC provider. The domain string is set once in `accounts/global.hcl` (`root_domain`).

**The one manual step:** after applying this layer, read its `name_servers` output (4 entries) and paste them into the dot.ph dashboard → **Manage → bookme.ph → Nameservers**, replacing dot.ph's defaults. dot.ph remains the *registrar*; Route 53 becomes the *DNS host*. Propagation is minutes to a few hours; ACM DNS validation then completes on its own.

**Apply order:** `dns` → (dot.ph nameserver change) → `frontend_hosting`. `frontend_hosting` reads `dns`'s `zone_id` via a terragrunt dependency, so the zone must exist first. Before `dns` is applied, `frontend_hosting` plans/applies fine with the default `*.cloudfront.net` cert (the dependency mocks `zone_id = ""`, which disables the custom-domain block).

**SES domain identity + DKIM + DMARC.** This layer owns the `aws_sesv2_email_identity` for `bookme.ph` and the 4 records that prove ownership and sign outbound mail:

| Record | Purpose |
|---|---|
| 3 × `<token>._domainkey.bookme.ph` CNAME → `<token>.dkim.amazonses.com` | DKIM signing keys; SES marks the identity Verified once these resolve |
| `_dmarc.bookme.ph` TXT → `v=DMARC1; p=quarantine;` | DMARC enforcement; unauthenticated mail claiming `@bookme.ph` is sent to spam. Tighten to `p=reject` once you've confirmed over time no legitimate 3rd-party sends as `@bookme.ph` |

Why here and not in `ses`: SES allows one identity per (account, domain), and stage + prod share the same account. Owning it in the (also stage-only) `dns` layer makes it shared by construction and keeps the records co-located with the hosted zone that holds them. Each env's `ses` layer still creates its own per-env IAM user + SMTP creds and sends *as* this shared identity.

**Importing an identity created in the SES console.** If the SES console was used to add `bookme.ph` before Terraform owned it, import the existing identity into state before the first apply (otherwise Terraform errors on "already exists"). DKIM tokens are preserved by the import — no DNS gap:

```bash
cd aws/accounts/stage/ap-southeast-1/dns
terragrunt import aws_sesv2_email_identity.root_domain bookme.ph
terragrunt plan    # only the 3 DKIM CNAMEs + 1 DMARC TXT should appear as creates
terragrunt apply
```

After apply, SES DKIM status transitions PENDING → SUCCESSFUL within minutes-to-an-hour as Route 53 propagates and SES re-checks. Verify with:

```bash
aws --profile reservation-stage sesv2 get-email-identity \
  --email-identity bookme.ph \
  --query 'DkimAttributes.Status'
```

DKIM verification is independent of SES sandbox — you still need a separate AWS support ticket ("Request production access" in the SES console) to send to non-verified recipients. AWS reviewers expect DKIM Successful before approving.

### `frontend_hosting`

**Creates** — S3 bucket (private, OAC-locked) + CloudFront distribution + GitHub OIDC provider + per-env deploy IAM role. When `frontend_domains` is set **and** the `dns` zone id is available, it also creates a us-east-1 ACM cert (DNS-validated) and apex/subdomain alias A+AAAA records.

**Custom domain** — driven by `frontend_domains` in each env's `region.hcl` (stage `["staging.bookme.ph"]`, prod `["bookme.ph", "www.bookme.ph"]`; first entry is the cert common name, the rest are SANs + extra aliases). The cert lives in **us-east-1** (CloudFront requirement) via the `aws.us-east-1` provider alias. Apex works because Route 53 **alias** records are zone-apex safe (a CNAME is not). Prod serves both `bookme.ph` and `www.bookme.ph` directly — no redirect. Empty list ⇒ `*.cloudfront.net` only.

Hosts the Next.js static export. The bucket is **not** publicly readable; CloudFront fetches via Origin Access Control. CloudFront `default_root_object = index.html` and 403/404 → `/index.html` so SPA-style client navigation and hard refreshes both work.

**OIDC provider quirk** — AWS allows only one OIDC provider per (account, issuer). The `stage` env creates it; `prod` reuses it by passing the ARN in [aws/accounts/prod/ap-southeast-1/frontend_hosting/terragrunt.hcl](../aws/accounts/prod/ap-southeast-1/frontend_hosting/terragrunt.hcl) `inputs.github_oidc_provider_arn`. Apply stage first, copy the output, then apply prod.

**Deploy role trust** is scoped to the **GitHub Environment**, not the branch: only `repo:yulstewartgurrea/reservation_app:environment:<env>` can assume it. Stage allows `environment:staging`; prod allows `environment:prod`. Workflow jobs must therefore declare `environment: staging` (or `prod`) in YAML — without it, the OIDC token's `sub` claim is `ref:refs/heads/<branch>` instead and the assume fails. Edit `github_environments` in each env's `region.hcl` to change.

**Outputs to wire into GitHub Environments** (Settings → Environments → staging / prod, add as **variables**):

| GitHub variable | Terraform output |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` |
| `AWS_S3_BUCKET` | `bucket_name` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `cloudfront_distribution_id` |
| `NEXT_PUBLIC_API_URL` | **do not set** — leave unset so the build uses a same-origin relative `/api` base (CloudFront routes `/api/*` + `/ws/*` to the backend; works on any domain, no CORS). Only set for a deliberate split-origin setup. |

Full deploy flow lives in [README.md](../README.md) under "Frontend deploy".

---

## 5. Configuration reference

### `accounts/global.hcl`

```hcl
locals {
  stage_account_id   = "..."       # USER: your AWS account ID
  stage_profile_name = "reservation-stage"  # USER: matches ~/.aws/credentials
  root_domain        = "bookme.ph"   # USER: the dot.ph-registered domain (one Route 53 zone)
}
```

### `accounts/stage/account.hcl`

Reads `global.hcl` and exposes `account_id` + `profile_name` for stage. You shouldn't need to edit this.

### `accounts/stage/ap-southeast-1/region.hcl`

The big knob file. Top-level locals:

| Local | What it does |
|---|---|
| `env`, `env_type`, `aws_region`, `project_name`, `az_number` | Identity. Don't change `env` or `project_name` after the first apply — they're in resource names. |
| `cidr`, `enable_nat_gateway`, `single_nat_gateway`, `vpce_list` | VPC shape. |
| `ecs_cluster_name`, `ecs_cluster`, `base_image_name`, `container_image` | ECS cluster shape + which image runs. |
| `tasks_iam_role_statements` | What SSM paths the running containers can read. Default: `/reservation/*` in this account. |
| `common_environment`, `common_secrets` | Shared `environment` and `secrets` blocks every container gets. |
| `ecs_services` | The map of services to create. Add/remove/resize here. |
| `ecr_settings` | Which ECR repos to create. |
| `create_rds`, `rds_settings` | Postgres. |
| `create_redis`, `redis_settings` | Redis. |
| `bucket_names_private`, `bucket_names_public` | S3 buckets. |
| `env_kv`, `ssm_parameters`, `secret_parameters` | Reads `parameters/env.yaml` and flattens into a single list of SSM params. |

### `accounts/stage/ap-southeast-1/parameters/env.yaml`

Two top-level keys:

```yaml
secret_parameters:    # → stored as SSM SecureString (KMS-encrypted at rest)
  DJANGO_SECRET_KEY: "..."
  PAYMONGO_SECRET_KEY: "..."

ssm_parameters:       # → stored as SSM String (plain)
  DJANGO_DEBUG: "False"
  DEFAULT_COMMISSION_RATE: "0.10"
```

Both end up under `/reservation/stage/<KEY>` in Parameter Store. The split only affects the SSM
parameter type — both are referenced by ECS the same way (path-based ARN).

**Keep this file's secret values either as placeholders or `git-crypt`-encrypted.** Real values
are easier to manage by editing SSM directly after the first apply (Terraform stops managing the
value — see `parameters` layer notes).

---

## 6. The boot path: how an HTTP request reaches Django

```
1. Client → https://bookme.ph/api/bookings/        (prod; stage uses staging.bookme.ph)
2. CloudFront → matches /api/* behavior, forwards to internal ALB (via VPC Origin)
3. Internal ALB → matches path_pattern *  → target group tg-svc-ecs-reservation-<env>-api
4. Target group → load-balances across registered ECS task ENIs
5. ECS task → Daphne ASGI server on container port 8000
6. Daphne → Django ASGI app (config.asgi:application)
7. Django → DRF view → ORM → Postgres / Redis / Celery
```

`/ws/*` follows the same path with WebSocket upgrade enabled on the CloudFront behaviour.

The ALB stays VPC-internal — direct access from a developer laptop still requires a bastion, SSM port-forward, or temporarily flipping `create_external_load_balancer = true` in region.hcl (don't do this in prod).

---

## 7. How secrets and config flow into containers

```
parameters/env.yaml
   │
   │ (parsed in region.hcl: ssm_parameters / secret_parameters → flat list)
   ▼
parameters layer applies → SSM parameters created at /reservation/stage/<KEY>
                              · DJANGO_SECRET_KEY    (SecureString)
                              · DJANGO_ALLOWED_HOSTS (String)
                              · PAYMONGO_*           (SecureString)
                              · …

rds layer applies → SSM parameters created:
                              · /reservation/stage/rds_host
                              · /reservation/stage/rds_password (SecureString)
                              · …

redis layer applies → SSM parameters created:
                              · /reservation/stage/redis_url    (SecureString)

ecs layer applies → task definition references each SSM ARN in `secrets`:
                              secrets = [
                                { name = "DJANGO_SECRET_KEY",
                                  valueFrom = "arn:aws:ssm:…:parameter/reservation/stage/DJANGO_SECRET_KEY" },
                                …
                              ]

ECS starts a task:
   1. Task execution role uses GetParameters to fetch every SSM value
   2. Each value is injected as the named env var into the container
   3. Container starts: Django reads `os.environ["DJANGO_SECRET_KEY"]` and friends
```

**Practical consequence:** Django's settings code doesn't know it's running on AWS — it just
reads `os.environ` like in local dev. The Docker image is identical to the one in `docker-compose`.

---

## 8. Operational runbook

### Stage: initial deploy (~10 min)

> For the prod initial deploy, see § 12 [Production deploy runbook](#12-production-deploy-runbook) — it's a different sequence (chicken-and-egg bootstrap, SES domain verification, IMMUTABLE ECR).

```bash
# (1) one-time: create the state bucket
ACCT=<your-account-id>
aws s3api create-bucket \
  --bucket terraform-states-$ACCT-ap-southeast-1 \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1 \
  --profile reservation-stage
aws s3api put-bucket-versioning \
  --bucket terraform-states-$ACCT-ap-southeast-1 \
  --versioning-configuration Status=Enabled \
  --profile reservation-stage

# (2) fill in global.hcl + env.yaml

# (3) apply
cd "aws/accounts/stage/ap-southeast-1"
terragrunt run-all apply

# (4) build + push the first image
cd ../../../..
aws ecr get-login-password --region ap-southeast-1 --profile reservation-stage \
  | docker login --username AWS --password-stdin $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com
docker build -t reservation-api:latest ./backend
docker tag reservation-api:latest $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/stage/api:latest
docker push $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/stage/api:latest

# (5) trigger the first ECS deployment (tasks have been failing to start until now)
aws ecs update-service --cluster ecs-reservation-stage \
  --service svc-ecs-reservation-stage-api --force-new-deployment \
  --region ap-southeast-1 --profile reservation-stage
aws ecs update-service --cluster ecs-reservation-stage \
  --service svc-ecs-reservation-stage-celery-worker --force-new-deployment \
  --region ap-southeast-1 --profile reservation-stage
aws ecs update-service --cluster ecs-reservation-stage \
  --service svc-ecs-reservation-stage-celery-beat --force-new-deployment \
  --region ap-southeast-1 --profile reservation-stage
```

### Day-2: deploy new code

1. Build + tag + push the image (steps 4 above)
2. `aws ecs update-service ... --force-new-deployment` per service

The image tag is `:latest` — `update-service` is the only signal ECS gets. Consider switching to
SHA tags + Terraform-managed task definitions for production (see "Extending the stack").

### Stage: rotate a secret

```bash
aws ssm put-parameter \
  --name /reservation/stage/PAYMONGO_SECRET_KEY \
  --type SecureString --overwrite \
  --value <new-value> \
  --region ap-southeast-1 --profile reservation-stage

# Force tasks to restart so they pick up the new value
aws ecs update-service --cluster ecs-reservation-stage \
  --service svc-ecs-reservation-stage-api --force-new-deployment \
  --region ap-southeast-1 --profile reservation-stage
```

ECS only reads SSM at task **start** — running containers keep the old value until restarted.

### Prod: rotate a secret

```bash
aws ssm put-parameter \
  --name /reservation/prod/PAYMONGO_SECRET_KEY \
  --type SecureString --overwrite \
  --value <new-value> \
  --region ap-southeast-1 --profile reservation-stage

# Force-cycle every service that consumes the secret (api, worker, beat).
for SVC in api celery-worker celery-beat; do
  aws ecs update-service --cluster ecs-reservation-prod \
    --service svc-ecs-reservation-prod-$SVC --force-new-deployment \
    --region ap-southeast-1 --profile reservation-stage
done
```

Same caveat as stage — SSM is read at task start, so rotation only takes effect after the rolling deploy completes. For prod prefer doing this during a quiet window since the api service rolls one task at a time.

### Tail logs

```bash
# All API logs, follow
aws logs tail /ecs/ecs-reservation-stage/image-reservation-stage-api \
  --follow --region ap-southeast-1 --profile reservation-stage

# Filter for errors
aws logs tail /ecs/ecs-reservation-stage/image-reservation-stage-api \
  --filter-pattern 'ERROR' --since 1h \
  --region ap-southeast-1 --profile reservation-stage
```

### Open a Django shell on a running task

```bash
# Find a running task ARN
aws ecs list-tasks --cluster ecs-reservation-stage \
  --service-name svc-ecs-reservation-stage-api \
  --region ap-southeast-1 --profile reservation-stage

# Exec into it (ECS Exec is enabled by default)
aws ecs execute-command \
  --cluster ecs-reservation-stage \
  --task <task-arn> \
  --container image-reservation-stage-api \
  --interactive --command "python manage.py shell" \
  --region ap-southeast-1 --profile reservation-stage
```

### Scale up

In [region.hcl](accounts/stage/ap-southeast-1/region.hcl), find the service and bump `desired_count`,
`cpu`, `memory`, or `autoscaling_max_capacity`. Apply:

```bash
cd aws/accounts/stage/ap-southeast-1/ecs
terragrunt apply
```

### Frontend: first-time provisioning

```bash
# (1) stage
cd aws/accounts/stage/ap-southeast-1/frontend_hosting
terragrunt apply
# Note `github_oidc_provider_arn` from the outputs.

# (2) prod — paste the OIDC ARN into
#     aws/accounts/prod/ap-southeast-1/frontend_hosting/terragrunt.hcl
#     (replace PASTE_OIDC_PROVIDER_ARN_FROM_STAGE_OUTPUTS), then:
cd ../../../prod/ap-southeast-1/frontend_hosting
terragrunt apply
```

Then wire the outputs into GitHub Environments (Settings → Environments → staging / prod → Variables):
`AWS_DEPLOY_ROLE_ARN`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DISTRIBUTION_ID`, `NEXT_PUBLIC_API_URL`. See [README → Frontend deploy](../README.md#frontend-deploy-s3--cloudfront) for the full first-time runbook.

### Custom domain (bookme.ph via dot.ph)

Domain registered at [dot.ph](https://www.dot.ph). dot.ph stays the *registrar*; we delegate DNS to Route 53. One zone, one nameserver change, then it's all Terraform.

**Live state (as of 2026-06-01):**

| Fact | Value |
|---|---|
| Registered domain | `bookme.ph` (dot.ph; registered 2026-05-19, expires 2027-05-19, auto-renew **off**) |
| Route 53 zone ID | `Z0098224309DW9ENSZFXV` (the `dns` layer — **applied**) |
| AWS nameservers | `ns-1114.awsdns-11.org`, `ns-1747.awsdns-26.co.uk`, `ns-339.awsdns-42.com`, `ns-849.awsdns-42.net` |
| Stage | **Live (verified 2026-05-18).** `https://staging.bookme.ph` serves the app over valid TLS. `dx1epgde94eqq.cloudfront.net` still works (kept in CORS). |
| Prod | **Live (verified 2026-06-01).** Both `https://bookme.ph` and `https://www.bookme.ph` serve the prod CloudFront distribution over valid TLS; no apex→www (or reverse) redirect — both hostnames are CloudFront aliases. Same zone, no second nameserver change. |

Keep this table current if the zone is ever recreated (nameservers change on recreate) or if either env's frontend distribution is replaced.

```bash
# (1) Create the single bookme.ph hosted zone (stage account).
cd aws/accounts/stage/ap-southeast-1/dns
terragrunt apply
terragrunt output name_servers      # 4 entries, e.g. ns-123.awsdns-45.com ...

# (2) ONE-TIME MANUAL STEP — in the dot.ph dashboard:
#     Manage → bookme.ph → Nameservers → replace dot.ph's defaults with the
#     4 servers from step 1. Save. Propagation: minutes to a few hours.

# (3) Stage: cert + alias records (staging.bookme.ph). Auto-reads the zone id.
cd ../frontend_hosting
terragrunt apply                    # ACM validates via DNS once NS propagate

# (4) Stage backend URLs already point at https://staging.bookme.ph in
#     parameters/env.yaml — re-apply parameters and restart tasks so emails
#     and CORS use the new host:
cd ../parameters && terragrunt apply
aws ecs update-service --cluster ecs-reservation-stage \
  --service svc-ecs-reservation-stage-api --force-new-deployment \
  --profile reservation-stage --region ap-southeast-1

# (5) Frontend must reach the API SAME-ORIGIN. Ensure NEXT_PUBLIC_API_URL is
#     UNSET in the GitHub env (Settings → Environments → staging/prod) so the
#     build uses a relative /api base, then redeploy the frontend (push a
#     frontend/** change). If it was baked with a cross-origin URL (e.g. the
#     raw *.cloudfront.net host), the app loads on the new domain but every API
#     call fails with "Network Error" (cross-origin + CORS). See README →
#     Troubleshooting: "Site loads but API calls return Network Error".
```

Verify: `https://staging.bookme.ph` serves the app **and** "Browse shops" loads data; `https://dx1epgde94eqq.cloudfront.net` keeps working (it's still an alias).

> **Domain-cutover gotcha (we hit this):** a custom domain in front of CloudFront is useless if the SPA was built pointing its API at a *different* host. The frontend is built same-origin (relative `/api`, `wss://<current-host>/ws`) precisely so any domain works with zero per-domain rebuild — see [README → CloudFront single-origin](../README.md) and `frontend/src/lib/api.ts`. Step (5) is the one that bites when adding the prod `bookme.ph` domain later.

**Prod (`bookme.ph` + `www.bookme.ph`)** is **live.** All 10 prod layers (`ci`, `networking`, `ecr`, `parameters`, `storage`, `rds`, `redis`, `ses`, `ecs`, `frontend_hosting`) are applied. The end-to-end deploy is documented in § 12 [Production deploy runbook](#12-production-deploy-runbook); push to `main` triggers the same CI workflow used for stage but resolves to the `prod` GitHub Environment.

### Frontend: deploy new code

You don't. Pushing to `staging` or `main` (with changes under `frontend/**`) triggers [.github/workflows/frontend-deploy.yml](../.github/workflows/frontend-deploy.yml), which builds, syncs to S3, and invalidates CloudFront. To force a redeploy without code changes:

```bash
git commit --allow-empty -m "Redeploy frontend"
git push origin staging   # or main
```

### Frontend: rotate the deploy role

If the role is compromised (or you want to change which branches can deploy):

```bash
# Edit github_deploy_refs in region.hcl for the env, then:
cd aws/accounts/stage/ap-southeast-1/frontend_hosting
terragrunt apply

# Then in GitHub Settings → Environments → <env>, refresh AWS_DEPLOY_ROLE_ARN
# (it usually won't change unless you also renamed it).
```

### Frontend: rollback

Easiest path is "redeploy an earlier commit":

```bash
git log --oneline staging   # or main
git push origin <good-sha>:staging --force-with-lease
```

The workflow re-runs against that SHA, rebuilds, re-syncs, invalidates. ~2 min to back.

For prod, prefer `git revert <bad-sha>` + PR + merge — better audit trail than force-push.

S3 versioning is enabled, so even if you nuked the bucket you can recover prior object versions via `aws s3api list-object-versions`.

### Tear down stage

```bash
cd aws/accounts/stage/ap-southeast-1
terragrunt run-all destroy
```

You'll need to **empty the media S3 bucket first** (it has `force_destroy = true` but only for empty buckets in some module versions). Also drop the ECR repo's images if `force_delete` blocks you.

---

## 9. Security model

### Network

- **Database subnets have no NAT route** — RDS can't initiate outbound traffic.
- **RDS / Redis SGs allow ingress only from the VPC CIDR**, not from `0.0.0.0/0`.
- **ECS task SGs allow ingress only from the internal ALB SG** (not from VPC CIDR broadly).
- **Internal ALB SG allows port 80 from the VPC CIDR** — no public exposure.
- All traffic between ECS, RDS, ElastiCache, ECR, S3 stays inside the VPC (VPC endpoints for ECR/S3).

### IAM

- **Task execution role** (per service, named `role-<service>-task-exec`)
  - Pulls images from ECR + ships logs (`AmazonECSTaskExecutionRolePolicy` managed)
  - Reads SSM params via a scoped inline policy — `ssm:GetParameter(s)[ByPath]` restricted to `arn:aws:ssm:<region>:<acct>:parameter/${project}/${env}/*` (so a stage exec role can't read prod params, and vice versa, in this single-account model)
  - Decrypts SecureString values via inline `kms:Decrypt` gated by `kms:ViaService = ssm.<region>.amazonaws.com` — only the SSM-mediated secret-injection path works, no direct KMS access. See `task_exec_iam_statements` in [aws/layers/ecs/main.tf](layers/ecs/main.tf). The AWS-managed `AmazonSSMReadOnlyAccess` policy that older revisions attached has been removed.
- **Task IAM role** (per service, named `role-<service>-task`)
  - What your *running* app code can do via AWS SDK
  - Default: scoped to `/reservation/*` SSM paths and KMS decrypt (via `tasks_iam_role_statements` in region.hcl), plus S3 object access to the media bucket only

### Secrets at rest

- All SSM `SecureString` parameters are encrypted with the default AWS-managed KMS key for SSM (`alias/aws/ssm`).
- RDS storage encryption is on (`storage_encrypted = true`).
- ElastiCache: `at_rest_encryption_enabled = true`, `transit_encryption_enabled = true`.

### Secrets in transit

- Postgres connection: `sslmode=require` in the connection URL.
- Redis connection: `rediss://` (TLS) with auth token.
- S3: TLS enforced.

### What's not yet hardened

- No WAF on either CloudFront distribution.
- No GuardDuty / SecurityHub / Config — turn these on at the account level outside this Terraform.
- No KMS CMKs — defaults to AWS-managed keys.
- ECR image-tag immutability is **enabled on prod** (`image_tag_mutability = "IMMUTABLE"` in [prod region.hcl](accounts/prod/ap-southeast-1/region.hcl)) so any pushed SHA tag — and the bootstrap `:latest` — is write-once and cannot be silently overwritten. Stage stays MUTABLE because CI re-pushes `:latest` on every staging deploy alongside the SHA tag.

---

## 10. Cost breakdown

Approximate monthly cost at idle, stage profile, `ap-southeast-1` pricing:

| Resource | Configuration | $/mo |
|---|---|---|
| NAT Gateway | 1 × NAT, 1 EIP, idle | ~$36 |
| VPC interface endpoints | 4 × interface × 2 AZ | ~$22 |
| RDS Postgres | `db.t4g.micro`, 20 GB gp3, 1 AZ | ~$13 |
| ElastiCache Redis | `cache.t3.micro`, 1 node | ~$12 |
| ALB (internal) | 1 ALB, low LCU | ~$17 |
| ECS Fargate (api) | 0.5 vCPU, 1 GB, 24/7 | ~$15 |
| ECS Fargate (worker) | 0.5 vCPU, 1 GB, 24/7 | ~$15 |
| ECS Fargate (beat) | 0.25 vCPU, 0.5 GB, 24/7 | ~$8 |
| CloudWatch Logs | minimal ingest + 30-day retention | ~$2 |
| S3 + ECR | <1 GB each | <$1 |
| Data transfer | minimal stage usage | ~$2 |
| **Total at idle** | | **~$140/mo** |

**Reduce by:** destroying stage between dev sessions, scaling celery services to 0 (`desired_count = 0`) when not running async work, removing VPC endpoints (saves ~$22 but slows ECR pulls).

---

## 11. Troubleshooting

### `terragrunt plan` fails with "no such file or directory" for `parameters/env.yaml`

`region.hcl` reads `${get_terragrunt_dir()}/parameters/env.yaml` at config-load time. If the file is missing, every layer's plan fails. Make sure
[accounts/stage/ap-southeast-1/parameters/env.yaml](accounts/stage/ap-southeast-1/parameters/env.yaml) exists.

### Backend bucket doesn't exist

```
Error: Failed to get existing workspaces: S3 bucket "terraform-states-..." does not exist
```

You skipped step (1) of "Initial deploy". Create the bucket, then re-run.

### RDS: `Cannot find version X.Y for postgres`

AWS deprecates older RDS Postgres minor versions on a rolling basis (typically ~12 months after release). When apply fails with this error, look up what's currently available:

```bash
aws rds describe-db-engine-versions --engine postgres --region ap-southeast-1 \
  --query 'DBEngineVersions[*].EngineVersion' --output text | tr '\t' '\n' | sort -V
```

Pick a current minor version, then in [region.hcl](accounts/stage/ap-southeast-1/region.hcl) under `rds_settings` update three fields: `engine_version`, `family` (e.g. `postgres17`), and `major_engine_version`. Postgres minor-version upgrades are app-transparent for Django, so just bumping to the latest is safe.

### ElastiCache: `InvalidCredentialsException: This action cannot be completed now`

Despite the misleading message, this is an AWS-side transient error (note the 408 status). Re-running the apply fixes it ~95% of the time. If it persists across 3 retries, confirm the IAM principal hasn't lost ElastiCache permissions.

### ECS tasks stuck in `STOPPED` / `EssentialContainerExited`

Check logs first: `aws logs tail /ecs/ecs-reservation-stage/image-reservation-stage-api`.

Common causes:
- **No image pushed yet** — image manifest not found in ECR.
- **DB unreachable** — wrong SG, RDS not yet up. Check `aws rds describe-db-instances`.
- **Bad env var** — Django's `environ` parsing is strict; a malformed value will crash on import. Look for `Improperly configured` lines.
- **Migration failure** — API entrypoint runs migrations on start. If the DB schema is in a weird state, you'll see migration errors. Exec in and run `python manage.py showmigrations` to inspect.

### Cannot reach the ALB from my laptop

The ALB is **internal** — DNS resolves only inside the VPC. Options:
- Use the public URL — `https://staging.bookme.ph` (stage) / `https://bookme.ph` (prod) — for normal API access. The ALB is reachable end-to-end via CloudFront's `/api/*` + `/ws/*` behaviours.
- For raw ALB access (e.g. debugging a CloudFront-specific issue): bastion + SSH port-forward, or AWS Systems Manager Session Manager port-forward to an EC2 in the private subnet.
- Temporarily flip `create_external_load_balancer = true` in region.hcl (only for short-lived stage debugging — exposes the API to the internet, never do this on prod).

### `terragrunt run-all apply` hangs on networking

VPC creation + NAT Gateway is slow (~5 min). Be patient. If it truly hangs >10 min, check AWS console for stuck CloudFormation-like operations.

### Random password keeps changing on every apply

Shouldn't — `random_password` is stable across applies as long as state isn't lost. If state was destroyed (e.g. you blew away the S3 backend), the password regenerates. Reset the RDS master password manually if needed:

```bash
aws rds modify-db-instance \
  --db-instance-identifier rds-reservation-stage \
  --master-user-password '<new-pw>' --apply-immediately \
  --region ap-southeast-1 --profile reservation-stage

# Then write the new password to SSM
aws ssm put-parameter \
  --name /reservation/stage/rds_password \
  --type SecureString --overwrite --value '<new-pw>' \
  --region ap-southeast-1 --profile reservation-stage
```

### `docker push` to ECR returns 403 even with a fresh login

**Root cause:** `AWS_PROFILE` (or active credentials) is pointing at a different account than the ECR repo lives in. The `aws ecr get-login-password` call succeeds against the wrong account, but the resulting docker login token is scoped to that wrong account — pushing to a repo it doesn't own returns 403 with no "wrong account" hint in the error body. This is easy to hit when juggling multiple `~/.aws/credentials` profiles.

```bash
aws sts get-caller-identity   # must show Account = 936146782254 (per accounts/global.hcl)
```

If the account doesn't match:

```bash
export AWS_PROFILE=reservation-stage
aws ecr get-login-password --region ap-southeast-1 \
  | docker login --username AWS --password-stdin \
      936146782254.dkr.ecr.ap-southeast-1.amazonaws.com
docker push ...   # retry
```

The previous docker login token is bound to the wrong account, so re-running `aws ecr get-login-password | docker login` with the right profile is required — clearing `~/.docker/config.json` for that registry also works.

### `bookme.ph` shows raw `<Error><Code>AccessDenied</Code>...</Error>` XML

**Root cause:** The S3 origin bucket is empty — no `index.html` to serve. CloudFront forwards S3's error response unmodified, so the browser sees S3's XML rather than a nice 404 page. This happens on the very first prod hit before frontend-deploy.yml has populated the bucket.

**Fix:** push to `main` to trigger [.github/workflows/frontend-deploy.yml](../.github/workflows/frontend-deploy.yml), or do the manual upload:

```bash
cd frontend
npm ci && npm run build
aws s3 sync out/ s3://s3-reservation-prod-frontend/ --delete --region ap-southeast-1
aws cloudfront create-invalidation \
  --distribution-id <prod-distribution-id> --paths '/*' --region ap-southeast-1
```

---

## 12. Production deploy runbook

This documents the actual sequence used to stand up prod (applied 2026-05-31 → 2026-06-01). It supersedes the older "Adding a production environment" 6-step sketch, which assumed a multi-account setup we ultimately didn't use.

**Prod is currently live** — `bookme.ph` and `www.bookme.ph` both serve the prod CloudFront distribution, all 10 prod Terragrunt layers are applied, and CI auto-deploys on push to `main`. This runbook captures *how we got there* so the same flow can be re-run after a tear-down or replicated in another region/account.

### Single-account model recap

Both stage and prod live in account `936146782254` (see [accounts/global.hcl](accounts/global.hcl)), in `ap-southeast-1`. The same AWS profile (`reservation-stage`) is used for both — separation is by resource-name prefix (`reservation-stage-*` vs. `reservation-prod-*`), VPC CIDR, and KMS-protected `/reservation/${env}/*` SSM paths. The execution-role IAM scoping in [aws/layers/ecs/main.tf](layers/ecs/main.tf) is what enforces that a stage task can't read prod params and vice versa.

### Prerequisites

```bash
export AWS_PROFILE=reservation-stage
aws sts get-caller-identity   # must return Account = 936146782254
```

If the account doesn't match, fix `AWS_PROFILE` (or `~/.aws/credentials`) before doing anything else — see Troubleshooting "docker push returns 403". Every command below assumes this profile.

Other prep:
- **DJANGO_SECRET_KEY for prod.** Generate a fresh value (`python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'`), drop it into [aws/accounts/prod/ap-southeast-1/parameters/env.yaml](accounts/prod/ap-southeast-1/parameters/env.yaml) for the first apply. After the parameters layer applies once, the values are no longer Terraform-managed (`lifecycle.ignore_changes = [value]`); overwrite directly via `aws ssm put-parameter --overwrite` and revert the file to a placeholder so the real value never lands in git.
- **SES domain verification.** In the SES console (region `ap-southeast-1`): Identities → Create identity → Domain → `bookme.ph` → enable **Easy DKIM**. SES emits 3 `CNAME` records; add them to the `bookme.ph` hosted zone (owned by the stage `dns` layer in [accounts/stage/ap-southeast-1/dns/](accounts/stage/ap-southeast-1/dns/)). Wait for the identity to show **Verified** before applying the prod `ses` layer — otherwise the layer will create an unusable identity.
- **Request SES production access** for the account if you haven't already — sandbox sends silently bounce for non-verified recipients. Approval is typically 24-48h; do this in parallel with everything else.

### Prod-specific configuration

The knobs that differ from stage live in [aws/accounts/prod/ap-southeast-1/region.hcl](accounts/prod/ap-southeast-1/region.hcl):

| Knob | Prod | Stage | Why |
|---|---|---|---|
| `cidr` | `10.245.0.0/20` | `10.244.0.0/20` | Non-overlapping VPCs in the same account |
| `single_nat_gateway` | `true` | `true` | Cost over HA — accepted SPOF for outbound traffic from private subnets |
| `create_database_internet_gateway_route` | `false` | `true` | No public RDS endpoint at all |
| `rds_publicly_accessible` | `false` | `true` (allowlisted) | Prod Postgres is VPC-internal only; reach via bastion/SSM |
| `db_allowed_cidrs` | `[]` | dev `/32` list | n/a — public access disabled |
| `multi_az` (RDS) | `true` | `false` | Sub-60s failover; ~2× RDS cost |
| `instance_class` (RDS) | `db.t4g.small` | `db.t4g.micro` | 2 GB RAM headroom |
| `deletion_protection` (RDS) | `true` | `false` | Two-step gate against accidental destroy |
| `node_type` (Redis) | `cache.t3.small` | `cache.t3.micro` | Smallest tier supporting `automatic_failover_enabled` |
| `num_cache_clusters` (Redis) | `2` | `1` | Primary + replica across AZs |
| `automatic_failover_enabled` (Redis) | `true` | `false` | Required for Channels/Celery continuity on AZ outage |
| `image_tag_mutability` (ECR) | `IMMUTABLE` | `MUTABLE` | Pushed `<sha>` and the bootstrap `:latest` are write-once |
| `verified_email` (SES) | `noreply@bookme.ph` | personal address | Domain-based sender |
| `frontend_domains` | `["bookme.ph", "www.bookme.ph"]` | `["staging.bookme.ph"]` | Apex + www both alias the prod distribution |
| `github_environments` | `["prod"]` | `["staging"]` | OIDC `sub` claim restricts who can assume the deploy role |
| `create_oidc_provider` | `false` | `false` | Stage's `frontend_hosting` already created the singleton |

### Apply order (the sequence we actually used)

The dependency DAG allows several layers to apply in parallel within each phase. Run each `terragrunt apply` from its own directory under `aws/accounts/prod/ap-southeast-1/`.

#### Phase 1 — Independent (run anytime, produces GitHub Environment values)

```bash
cd aws/accounts/prod/ap-southeast-1/ci
terragrunt apply

cd ../frontend_hosting
terragrunt apply
# Outputs: bucket_name, cloudfront_distribution_id, github_deploy_role_arn
```

Stage already created the GitHub OIDC provider (singleton per account). Both prod layers consume it: `frontend_hosting` via [prod/frontend_hosting/terragrunt.hcl](../aws/accounts/prod/ap-southeast-1/frontend_hosting/terragrunt.hcl) `inputs.github_oidc_provider_arn`, and `ci` via `create_oidc_provider = false` in [prod region.hcl](accounts/prod/ap-southeast-1/region.hcl).

#### Phase 2 — Networking (~5 min for NAT Gateway)

```bash
cd ../networking
terragrunt apply
```

#### Phase 3 — Config + storage + registry (parallel-safe)

```bash
cd ../parameters && terragrunt apply &
cd ../ecr && terragrunt apply &
cd ../storage && terragrunt apply &
wait
```

`parameters` reads `parameters/env.yaml` and creates the `/reservation/prod/*` SSM tree. After this first apply, overwrite real secret values with `aws ssm put-parameter --overwrite` and put placeholders back in `env.yaml`.

#### Phase 4 — Databases + email (need VPC; SES needs the domain verified)

```bash
cd ../rds && terragrunt apply   # ~10 min, longest single step
cd ../redis && terragrunt apply
cd ../ses && terragrunt apply   # requires the SES identity to already show "Verified"
```

#### Phase 5 — Bootstrap the first ECR image

ECS can't start tasks until an image exists in the prod ECR repo. CI doesn't help yet (see Phase 6 caveat), so push manually:

```bash
ACCT=936146782254
aws ecr get-login-password --region ap-southeast-1 \
  | docker login --username AWS --password-stdin $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com

# --platform linux/amd64 is required on Apple Silicon — prod Fargate runs X86_64
# (see runtime_platform_x86 in prod region.hcl).
docker build --platform linux/amd64 -t reservation-api:bootstrap ./backend
docker tag reservation-api:bootstrap \
  $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/prod/api:latest
docker push $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/prod/api:latest
```

**IMMUTABLE caveat:** prod's ECR repo (`image_tag_mutability = "IMMUTABLE"`) means `:latest` can only be pushed **once**. From here on every deploy uses SHA tags. If you ever need to re-bootstrap (e.g. after a `terragrunt destroy`), either delete the `latest` tag in ECR first or push a different bootstrap tag and pass it to step 6.

#### Phase 6 — ECS (~5-7 min)

```bash
cd ../ecs
API_IMAGE_TAG=latest terragrunt apply
```

`API_IMAGE_TAG` defaults to `latest` (see [prod region.hcl](accounts/prod/ap-southeast-1/region.hcl) `api_image_tag = get_env("API_IMAGE_TAG", "latest")`) so passing it explicitly is belt-and-suspenders for the bootstrap. After the first deploy, CI sets `API_IMAGE_TAG=<short-sha>` and we never use `:latest` for prod again.

#### Phase 7 — Backfill `DJANGO_ALLOWED_HOSTS` and cycle tasks

The ECS task definition references `/reservation/prod/DJANGO_ALLOWED_HOSTS`, but the ALB DNS name isn't known until the ecs layer applies — so the placeholder in `env.yaml` is wrong on first boot. Health checks from the ALB hit the task's IP directly, but the `/health/` view (and any forwarded request) gets rejected by Django's `ALLOWED_HOSTS` middleware until we update it:

```bash
# Look up the ALB DNS name
aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?contains(LoadBalancerName, 'reservation-prod')].DNSName" \
  --output text --region ap-southeast-1

aws ssm put-parameter \
  --name /reservation/prod/DJANGO_ALLOWED_HOSTS \
  --type String --overwrite \
  --value "bookme.ph,www.bookme.ph,<alb-dns-name>,.amazonaws.com" \
  --region ap-southeast-1

# Force-cycle so containers pick up the new value
for SVC in api celery-worker celery-beat; do
  aws ecs update-service --cluster ecs-reservation-prod \
    --service svc-ecs-reservation-prod-$SVC --force-new-deployment \
    --region ap-southeast-1
done
```

#### Phase 8 — First frontend build/deploy

Two options:

```bash
# Option A — let CI do it (preferred)
git push origin main      # any change touching frontend/** triggers frontend-deploy.yml

# Option B — manual, mirroring the workflow's recipe
cd frontend
npm ci && npm run build   # produces ./out
aws s3 sync out/ s3://s3-reservation-prod-frontend/ --delete \
  --region ap-southeast-1
aws cloudfront create-invalidation \
  --distribution-id <prod-distribution-id> --paths '/*' \
  --region ap-southeast-1
```

Until you complete Phase 8, hitting `https://bookme.ph` returns CloudFront's pass-through of S3's `AccessDenied` XML — see Troubleshooting "bookme.ph shows raw AccessDenied XML".

### GitHub `prod` Environment setup

Settings → Environments → **New environment** → name `prod`. Add four **Variables** (not Secrets — these are non-sensitive ARNs/names):

| GitHub Variable | Where it comes from |
|---|---|
| `AWS_BACKEND_DEPLOY_ROLE_ARN` | `cd aws/accounts/prod/ap-southeast-1/ci && terragrunt output -raw deployer_role_arn` |
| `AWS_DEPLOY_ROLE_ARN` | `cd aws/accounts/prod/ap-southeast-1/frontend_hosting && terragrunt output -raw github_deploy_role_arn` |
| `AWS_S3_BUCKET` | `terragrunt output -raw bucket_name` (in the same frontend_hosting dir) |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `terragrunt output -raw cloudfront_distribution_id` (same dir) |

**Do NOT set `NEXT_PUBLIC_API_URL`** — the frontend talks to `/api` same-origin via CloudFront, so leaving it unset is correct (a baked-in absolute URL would force CORS and break the cutover). See § "Custom domain" and [README → Troubleshooting: Site loads but API calls return Network Error](../README.md).

Recommended protections under Environments → prod → **Protection rules**:
- **Required reviewers** — at least one named reviewer (yourself) so prod deploys require an explicit click.
- **Deployment branches** → "Selected branches" → only allow `main`.

The same set of variables under the same names already exists in the `staging` environment — keeping them per-env (not repo-level) is what lets the `resolve` job in [backend-deploy.yml](../.github/workflows/backend-deploy.yml) flip between them based on branch.

### Day-2 ops for prod

| Trigger | Effect |
|---|---|
| `git push origin main` touching `backend/**` or `aws/**` | Runs [backend-deploy.yml](../.github/workflows/backend-deploy.yml): tests → build & push SHA-tagged image to prod ECR → register & run migrate task → `terragrunt apply` on the prod `ecs` layer → wait for services-stable |
| `git push origin main` touching `frontend/**` | Runs [frontend-deploy.yml](../.github/workflows/frontend-deploy.yml): build → `aws s3 sync` to prod bucket → CloudFront invalidation |
| Actions → **Backend deploy** → Run workflow → `environment=prod`, `image_tag=<old-sha>` | Manual rollback — skips build, validates the tag exists in ECR, re-runs migrations + ECS rollout |
| Actions → **Backend deploy** → Run workflow → `environment=prod` (no image_tag) | Emergency deploy from a non-`main` branch — uses the workflow's current HEAD SHA |

### Rollback

The image is already in ECR with a SHA tag (CI tagged it during the original deploy). Trigger Actions → **Backend deploy** → **Run workflow** with `environment=prod` and `image_tag=<the previous good SHA>`. The build step will verify the tag exists, then migrate + ECS rollout proceed. End-to-end ~5 min.

For a frontend-only rollback, push the previous good commit (or `git revert <bad-sha>` + PR + merge) — frontend-deploy.yml re-syncs S3 and invalidates CloudFront.

Schema migrations require manual care: rolling back to a code version that can't read the current schema means manually reverting the migration first (via `aws ecs execute-command` on a running api task, `python manage.py migrate <app> <previous_migration>`). See § 13 CI/CD → "Redeploy / rollback" for the same caveat on stage.

---

## 13. CI/CD with GitHub Actions

Push to `staging` → deploys stage. Push to `main` → deploys prod. Tests run once, image is built and pushed to the env-specific ECR repo with a SHA tag, migrations run as a one-shot ECS task, ECS services roll over to the new image. Auth is via **GitHub OIDC** — no long-lived AWS access keys live in the repo.

### Pipeline shape

```
push to staging  →  GitHub Environment: staging  →  reservation/stage/api  →  ecs-reservation-stage
push to main     →  GitHub Environment: prod     →  reservation/prod/api   →  ecs-reservation-prod
     │
     ▼
┌────────────┐    ┌────────────┐    ┌─────────────────┐    ┌───────────────────┐    ┌──────────────────────┐
│  test      │──▶│  resolve   │──▶│  build & push   │──▶│  migrate          │──▶│  deploy              │
│            │   │            │   │                 │   │                   │   │                       │
│ Postgres + │   │ branch →   │   │ docker build →  │   │ register one-off  │   │ TF_VAR-style override │
│ Redis svc  │   │ env →      │   │ ECR push (SHA + │   │ task def from     │   │ API_IMAGE_TAG=<sha>   │
│ containers │   │ resource   │   │ latest tags)    │   │ API template,     │   │ → terragrunt apply    │
│ → manage.py│   │ names      │   │                 │   │ run as Fargate    │   │   on ecs layer        │
│   test     │   │            │   │                 │   │ task, wait for    │   │ → wait for services-  │
│            │   │            │   │                 │   │ exit code 0       │   │   stable              │
└────────────┘    └────────────┘    └─────────────────┘    └───────────────────┘    └──────────────────────┘

  test job:     environment-agnostic — spins up its own Postgres + Redis service containers.
  resolve job:  maps git ref → env. workflow_dispatch overrides the mapping for emergency deploys.
                Exports ecs_cluster, api_service, worker_service, beat_service, tg_working_dir to
                downstream jobs so no resource name is hardcoded.
  build:        when redeploying (workflow_dispatch with image_tag), this step verifies the
                existing image in the env-specific ECR repo rather than rebuilding.
  migrate:      if exit code != 0, the deploy job is skipped and old tasks keep serving.
  deploy:       per-env concurrency (`backend-deploy-${environment}`) — stage and prod can deploy
                in parallel, but two pushes to the same env queue rather than race.
```

### Files

| File | What it is |
|---|---|
| [`.github/workflows/backend-deploy.yml`](../.github/workflows/backend-deploy.yml) | The multi-env pipeline definition (staging branch → staging env, main branch → prod env) |
| [`.github/workflows/README.md`](../.github/workflows/README.md) | Workflow setup + rollback notes |
| [`aws/layers/ci/`](layers/ci/) | Terraform: per-env deployer IAM role (reuses the account-singleton GitHub OIDC provider created by stage `frontend_hosting`) |
| [`aws/accounts/stage/ap-southeast-1/ci/terragrunt.hcl`](accounts/stage/ap-southeast-1/ci/terragrunt.hcl) | Stage stub for the CI layer |
| [`aws/accounts/prod/ap-southeast-1/ci/terragrunt.hcl`](accounts/prod/ap-southeast-1/ci/terragrunt.hcl) | Prod stub for the CI layer |

### One-time setup (per environment)

Both stage and prod follow the same shape — only the directory and GitHub Environment name differ.

1. **Apply the `ci` layer once** (locally, with admin creds), so the per-env deployer role exists:
   ```bash
   cd aws/accounts/<env>/ap-southeast-1/ci    # <env> = stage or prod
   terragrunt apply
   ```

2. **Grab the role ARN:**
   ```bash
   terragrunt output -raw deployer_role_arn
   # → arn:aws:iam::<account>:role/role-github-actions-reservation-<env>-deployer
   ```

3. **In GitHub:**
   - Settings → Environments → **New environment** → name it `staging` (or `prod`).
     For prod, configure protection rules: required reviewers + restrict deployment branches to `main`.
   - In that Environment → Variables → add `AWS_BACKEND_DEPLOY_ROLE_ARN` = the ARN from step 2.
     (Per-Environment Variables — the same name lives in both. The workflow's `resolve` job picks the right one via `environment: ${{ needs.resolve.outputs.environment }}`.)
   - The frontend deploy workflow uses three additional per-env Variables (`AWS_DEPLOY_ROLE_ARN`, `AWS_S3_BUCKET`, `AWS_CLOUDFRONT_DISTRIBUTION_ID`) — see § 12 "GitHub `prod` Environment setup" and the README "Frontend deploy" section.

4. **Push to the matching branch.** `staging` branch deploys to stage; `main` deploys to prod. First deploy takes ~6-8 min.

### Trust policy — what the role accepts

The OIDC trust policy (in [layers/ci/main.tf](layers/ci/main.tf)) allows each per-env role to be assumed **only** when these claims are present on the GitHub token:

- `aud == sts.amazonaws.com` — standard for AWS OIDC.
- `sub LIKE repo:<github_repo>:environment:<env>` — for any `<env>` in that env's `github_environments` list.

Concretely:
- Stage role accepts `repo:yulstewartgurrea/reservation_app:environment:staging`.
- Prod role accepts `repo:yulstewartgurrea/reservation_app:environment:prod`.

Because the trust policy keys on the GitHub Environment claim, not on a branch ref, a workflow that forgot to set `environment:` would fail STS assume regardless of which branch it ran on. The `resolve` + per-job `environment: ${{ needs.resolve.outputs.environment }}` pattern in the workflow ensures the right claim ends up in the token for whichever branch fired the run.

### Permissions of the deployer role

| Grant | Source | Why |
|---|---|---|
| Read everything in the account | AWS-managed `ReadOnlyAccess` | `terragrunt apply` refreshes state on every resource type. Read-only is broad but reversible. |
| Push to ECR | AWS-managed `AmazonEC2ContainerRegistryPowerUser` | `docker push`, plus pulling layers during build. |
| ECS create/update/run-task | AWS-managed `AmazonECS_FullAccess` | Register task defs, update services, run one-off migrate tasks. |
| `iam:PassRole` on ECS task roles | inline policy in [`main.tf`](layers/ci/main.tf) | Required to register a task def that references task roles. Scoped to the exact role names from `ecs_services`. |
| `s3:*Object` on `ecs/*` state key | inline policy | Terraform state for the ecs layer only. |
| `logs:CreateLogGroup` on `/ecs/*` | inline policy | New task def revisions reference log groups. |

**Notably absent** — write access to RDS, VPC, IAM (beyond task roles), S3 (beyond state), or any
other layer's resources. If a malicious push tried `terragrunt apply` on the `rds` layer, it would
fail at the AWS API level.

### Day-2 ops with CI in place

#### Normal deploy

Merge a PR to `main`. Done.

#### Redeploy / rollback

GitHub UI → Actions → **Backend deploy** → Run workflow → enter a previous short SHA (e.g. `a1b2c3d4e5f6`) in the **image_tag** input. The build step skips (just verifies the tag exists in ECR), migrations run again, ECS rolls over.

⚠️ Rolling back across schema migrations is not safe out of the box. If the rollback target's code can't read the current schema, you need to manually revert the migration first (`python manage.py migrate <app> <previous_migration>`) using an ECS exec or a one-off task.

#### Skip the pipeline for an emergency manual fix

If GitHub is down or you need to deploy faster than CI, you can repeat the steps locally. Set `ENV` to `stage` or `prod` for the target.

```bash
ENV=stage  # or prod
ACCT=$(aws sts get-caller-identity --query Account --output text)
SHA=$(git rev-parse --short=12 HEAD)
aws ecr get-login-password --region ap-southeast-1 \
  | docker login --username AWS --password-stdin $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com
docker build --platform linux/amd64 -t reservation-api:$SHA ./backend
docker tag reservation-api:$SHA $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/$ENV/api:$SHA
docker push $ACCT.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/$ENV/api:$SHA

cd aws/accounts/$ENV/ap-southeast-1/ecs
API_IMAGE_TAG=$SHA terragrunt apply
```

Prod's ECR is IMMUTABLE — a SHA you've already pushed can't be re-pushed. If you need to re-cut from the same commit, append a suffix to `$SHA` (e.g. `${SHA}-hotfix1`).

### Why this design

- **SHA tags, not `:latest`** — reproducible deploys, trivial rollback, no "what's actually running?" question. Reinforced for prod by IMMUTABLE ECR tags.
- **Migrations as a one-off task, not in the API entrypoint** (well, *also* in the entrypoint as a safety net) — a bad migration aborts the deploy instead of looping crashed tasks.
- **Terraform-managed task definition** — `API_IMAGE_TAG` env → Terragrunt → new task def revision. Image version is part of state; no drift between IaC and reality.
- **OIDC over access keys** — short-lived credentials, revocable per-repo, no rotation overhead.
- **Per-env GitHub Environments** — same workflow file, different Variables, different IAM role per env, different concurrency group. Stage and prod never share credentials or block each other.
- **`AmazonECS_FullAccess` is broader than ideal** — both stage and prod use it today. Acceptable trade-off given the trust policy is locked to the per-env GitHub Environment claim; if hardened later, swap for a custom policy scoped to the specific cluster ARN.

### CI/CD troubleshooting

**`Error: Could not assume role with OIDC`**
- The `AWS_BACKEND_DEPLOY_ROLE_ARN` variable is missing in the *target* Environment (not at the repo level — per-env Variable), has a typo, or points to the wrong account.
- The workflow run isn't targeting the right environment — check the `resolve` job output and the per-job `environment:` key.
- The OIDC provider doesn't exist in the account — re-apply stage's `frontend_hosting` layer (which creates the singleton) or stage `ci`.

**`AccessDenied` from `aws ecs register-task-definition`**
- Usually `iam:PassRole`. Check that the task role names (e.g. `role-svc-ecs-reservation-<env>-api-task`) are in the `task_role_names` input of the ci layer for that env. The ecs layer outputs the names; the ci layer reads them.

**Migration task starts but fails with `Could not connect to database`**
- The task is using the API service's network config (private subnets + SGs). Check that the API service can reach the DB — if it can, so can the migrate task. If not, networking issue.

**First prod deploy via CI fails with empty `CURRENT_TD_ARN`**
- Chicken-and-egg — the migrate job clones the API service's existing task definition, but on first deploy that service has no running tasks yet. Bootstrap manually first per Phases 5–6 of § 12 [Production deploy runbook](#12-production-deploy-runbook), then push to `main`.

**Pipeline succeeds but new code isn't live**
- ECS rolling deploy can take 2-3 min after `services-stable` is signaled. Check task definition revision: `aws ecs describe-services --cluster ecs-reservation-<env> --services svc-ecs-reservation-<env>-api --query 'services[0].taskDefinition'` — should match the deploy step's output.
- If the task definition is right but tasks are still old, check the deployment circuit breaker isn't aborting due to health-check failures.

**Tests pass locally but fail in CI**
- CI runs against fresh Postgres/Redis service containers — no shared state. If tests depend on data, they're not isolated. Common offender: `Reservation` tests that depend on seeded categories. The CI test job doesn't run `seed_categories`; fix the tests to seed their own fixtures.

---

## 14. Extending the stack

### WebSocket public ALB

The Channels backend can be reached via CloudFront's `/ws/*` path pattern today (same internal ALB origin as `/api/*`), but CloudFront's idle timeout (max 60s, default 4s for some edge configurations) limits long-lived WebSocket connections. For chat / live updates that need stable multi-minute connections, port the `websocket/` layer from the Elated baseline: a separate public ALB on port 8000 with sticky sessions and `/healthz`, fronted by Route 53.

### Hardening the deployer role for prod

`AmazonECS_FullAccess` and `ReadOnlyAccess` are broader than strictly needed. To tighten:
1. Replace `AmazonECS_FullAccess` with a custom policy scoped to the specific cluster ARN.
2. Replace `ReadOnlyAccess` with narrow `Describe*`/`List*` on the resource types Terraform actually refreshes for the ecs layer.

Trade-off: every new resource type added to the `ecs` layer downstream needs a corresponding policy update, which is friction. Defer until the layer shape stabilises.

### Media uploads with S3

Already wired — see the [`storage` layer reference](#storage) above for how Django, the SSM parameter, and the task IAM policy fit together. Both stage and prod use private buckets with 6-hour presigned URLs.

