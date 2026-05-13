# Reservation app — AWS infrastructure (Terraform / Terragrunt)

Infrastructure-as-code for deploying the reservation app to AWS. Adapted from the Elated Terraform baseline.

> **Looking for deeper reference?** [DOCUMENTATION.md](DOCUMENTATION.md) covers the architecture,
> layer-by-layer reference, configuration knobs, secrets-flow, operational runbook, security model,
> cost breakdown, and troubleshooting. This README is the quick-start.

## What this provisions (stage / ap-southeast-1)

- **VPC** (`10.244.0.0/20`) across 2 AZs with public, private, and database subnets; single NAT
  Gateway; VPC endpoints for `logs`, `ecr.api`, `ecr.dkr`, `s3`
- **ECR** repo: `reservation/stage/api` (single image used by api + worker + beat)
- **ECS Fargate** cluster with 3 services:
  - `svc-ecs-reservation-stage-api` — Daphne ASGI on port 8000, internal ALB, health `/health/`
  - `svc-ecs-reservation-stage-celery-worker` — Celery worker (concurrency 4)
  - `svc-ecs-reservation-stage-celery-beat` — Celery beat scheduler
- **RDS PostgreSQL 16.4** — `db.t4g.micro`, single-AZ, encrypted at rest, db `reservation`
- **ElastiCache Redis 7.1** — `cache.t3.micro`, TLS, used by Channels and Celery
- **SSM Parameter Store** — DB/Redis connection params + app config from `parameters/env.yaml`
- **S3** — private bucket for media uploads
- **Internal ALB** — fronts the API; reachable from inside the VPC

**Region:** `ap-southeast-1` (Singapore — lowest-latency AWS region to Philippines).

**Not included in this initial stage deploy:** CloudFront, Route 53, ACM certificates, SES, and
the websocket public ALB. These all need a registered domain — see "Adding a domain later" below.

## Layout

```
aws/
├── accounts/
│   ├── global.hcl                           # account IDs + AWS profile names
│   ├── terragrunt_base.hcl                  # remote state, provider/variable generation
│   ├── _common/                             # provider, variables, version constraints
│   └── stage/
│       ├── account.hcl
│       └── ap-southeast-1/
│           ├── region.hcl                   # the meaty config — ECS services, RDS/Redis settings
│           ├── networking/terragrunt.hcl
│           ├── ecr/terragrunt.hcl
│           ├── parameters/
│           │   ├── env.yaml                 # app config + secrets (PayMongo keys etc.)
│           │   └── terragrunt.hcl
│           ├── rds/terragrunt.hcl
│           ├── redis/terragrunt.hcl
│           ├── ecs/terragrunt.hcl
│           └── storage/terragrunt.hcl
└── layers/
    ├── networking/  ecr/  parameters/  rds/  redis/  ecs/  storage/
```

## Prerequisites

1. **Tools** — Install:
   - Terraform `>= 1.5`
   - Terragrunt `>= 0.55`
   - AWS CLI v2
2. **AWS account** — Have an AWS account ID ready. The user / role must be able to manage:
   VPC, ECS, ECR, RDS, ElastiCache, IAM, SSM, S3, CloudWatch Logs.
3. **AWS CLI profile** — Configure a local profile named `reservation-stage`:
   ```bash
   aws configure --profile reservation-stage
   # AWS Access Key ID:     AKIA...
   # AWS Secret Access Key: ...
   # Default region name:   ap-southeast-1
   # Default output format: json
   ```
   (If you prefer a different profile name, update `stage_profile_name` in
   [accounts/global.hcl](accounts/global.hcl) to match.)
4. **Terraform state bucket** — Terragrunt stores state in S3 at
   `terraform-states-<account-id>-ap-southeast-1`. Create it once before the first apply:
   ```bash
   aws s3api create-bucket \
     --bucket terraform-states-<YOUR_ACCOUNT_ID>-ap-southeast-1 \
     --region ap-southeast-1 \
     --create-bucket-configuration LocationConstraint=ap-southeast-1 \
     --profile reservation-stage
   aws s3api put-bucket-versioning \
     --bucket terraform-states-<YOUR_ACCOUNT_ID>-ap-southeast-1 \
     --versioning-configuration Status=Enabled \
     --profile reservation-stage
   ```

## One-time setup

1. Edit [accounts/global.hcl](accounts/global.hcl) — replace `REPLACE_WITH_STAGE_ACCOUNT_ID` with
   your real AWS account ID. Adjust the profile name if needed.
2. Fill in real values in
   [accounts/stage/ap-southeast-1/parameters/env.yaml](accounts/stage/ap-southeast-1/parameters/env.yaml) — at minimum:
   - `DJANGO_SECRET_KEY` — generate with `python -c 'import secrets; print(secrets.token_urlsafe(50))'`
   - `PAYMONGO_SECRET_KEY` / `PAYMONGO_PUBLIC_KEY` / `PAYMONGO_WEBHOOK_SECRET` — from the
     [PayMongo dashboard](https://dashboard.paymongo.com/developers); leave blank to start with
     dev-fake checkout (see project root `CLAUDE.md`).
   - `DJANGO_ALLOWED_HOSTS` — set after first apply once you know the ALB DNS name.
3. Build and push the first container image to ECR (see "Deploying app code" below). The ECS
   services will fail health checks until an image is present.

## Apply

```bash
cd "aws/accounts/stage/ap-southeast-1"

# First time, in order — backend bucket must exist (see Prerequisites #4)
terragrunt run-all init

# Plan everything
terragrunt run-all plan

# Apply everything (creates VPC, RDS, Redis, ECR, ECS, SSM params, S3 buckets)
terragrunt run-all apply
```

If you hit dependency errors on the very first plan, that's expected — some layers read outputs
from sibling layers that don't exist yet. Just run `apply` directly (it walks the dependency
graph). To target one layer, `cd` into it (e.g. `cd networking/`) and run `terragrunt apply`.

## Deploying app code

> Most of the time you don't run these by hand. After the one-time setup, the GitHub Actions
> workflow at [.github/workflows/backend-deploy.yml](../.github/workflows/backend-deploy.yml) does
> all of this on every push to `staging` or `main`. See [DOCUMENTATION.md § 13 "CI/CD with GitHub Actions"](DOCUMENTATION.md#13-cicd-with-github-actions)
> for setup + rollback. The manual steps below are for the very first deploy (before CI exists)
> or emergencies.

1. Authenticate Docker against the new ECR repo:
   ```bash
   aws ecr get-login-password --region ap-southeast-1 --profile reservation-stage \
     | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com
   ```
2. Build the backend image (from repo root):
   ```bash
   docker build -t reservation-api:latest ./backend
   docker tag reservation-api:latest \
     <ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/stage/api:latest
   docker push \
     <ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/reservation/stage/api:latest
   ```
3. Force a new ECS deployment so tasks pick up the latest image:
   ```bash
   aws ecs update-service \
     --cluster ecs-reservation-stage \
     --service svc-ecs-reservation-stage-api \
     --force-new-deployment \
     --region ap-southeast-1 --profile reservation-stage
   ```

The ECS task definition references `:latest`, so `--force-new-deployment` is the redeploy trigger.

## Hitting the API

After apply, the API is reachable at the **internal ALB DNS name**:

```bash
cd aws/accounts/stage/ap-southeast-1/ecs
terragrunt output lb_internal
```

It's *internal* (private to the VPC), so you can't curl it from your laptop. Options:

- **Bastion / port-forward** via SSM Session Manager — quickest for testing
- **Public CloudFront in front of the ALB** — needs a domain (see below)
- **Make the ALB public** — set `create_external_load_balancer = true` in `region.hcl`
  (only do this temporarily; it exposes the API directly to the internet)

## Adding a domain later

When you register a domain (Route 53, Namecheap, etc.):

1. In [region.hcl](accounts/stage/ap-southeast-1/region.hcl), set `domain_name` and `base_url`
   locals (e.g. `"stage-api.reserva.ph"`).
2. Copy these layers from the Elated baseline into `aws/layers/` (they're already production-ready):
   `cloudfront/`, `route53/`, `ses/`, `websocket/`.
3. Request an ACM cert in `us-east-1` for CloudFront aliases, or use the route53 layer to
   auto-validate.
4. Add stage stubs for each new layer under `accounts/stage/ap-southeast-1/<layer>/terragrunt.hcl`.
5. Apply. CloudFront sits in front of the internal ALB; PayMongo webhooks hit
   `https://<your-domain>/api/payments/paymongo/webhook/`.

## Common operations

```bash
# Plan a single layer
cd aws/accounts/stage/ap-southeast-1/rds && terragrunt plan

# Tear down stage (keep ECR + state bucket)
cd aws/accounts/stage/ap-southeast-1 && terragrunt run-all destroy

# Inspect an SSM param
aws ssm get-parameter --with-decryption \
  --name /reservation/stage/rds_password \
  --region ap-southeast-1 --profile reservation-stage
```

## Cost notes

Stage's ongoing-cost items are NAT Gateway (~$32/mo), RDS `t4g.micro` (~$13/mo),
ElastiCache `t3.micro` (~$12/mo), ALB (~$16/mo), VPC endpoints (~$22/mo for 4 interfaces).
Roughly **$95–110/mo** all-in for stage at idle. Destroying stage between dev sessions is fine — apply takes ~10 min from cold.

## What's intentionally not here

- **Stripe.** This app uses PayMongo (PHP-only). Don't try to add Stripe payment infrastructure.
- **PostGIS.** Geo search is Haversine + bounding box in plain SQL (per `app_ideas.md` §8). RDS
  PostgreSQL 16 is plain Postgres, not the GIS variant.
- **Multi-region.** Single region (ap-southeast-1) for cost and latency to PH users.
- **CloudFront / domain.** Opt-in once you have a domain (see above).
