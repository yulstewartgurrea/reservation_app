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
- **RDS PostgreSQL 17.4** — `db.t4g.micro`, single-AZ, encrypted at rest, db `reservation`
- **ElastiCache Redis 7.1** — `cache.t3.micro`, TLS, used by Channels and Celery
- **SES** — verified sender identity + SMTP IAM user; credentials piped into SSM at
  `/reservation/stage/ses/*` and read by the ECS task as `EMAIL_*`
- **SSM Parameter Store** — DB/Redis connection params + app config from `parameters/env.yaml`
- **S3** — private bucket for media uploads
- **Internal ALB** — fronts the API; reachable from inside the VPC

**Region:** `ap-southeast-1` (Singapore — lowest-latency AWS region to Philippines).

**Not included in this initial stage deploy:** CloudFront, Route 53, ACM certificates, and the
websocket public ALB. These all need a registered domain — see "Adding a domain later" below.
SES is provisioned in **email-only** mode (single verified address); upgrade to domain
verification once you have a hosted zone.

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
    ├── networking/  ecr/  parameters/  rds/  redis/  ecs/  ses/  storage/
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

## SES (transactional email) setup

The `ses` layer provisions a verified sender identity, an IAM user with `ses:SendRawEmail`,
an access key, and writes the resulting SMTP credentials into SSM under
`/reservation/<env>/ses/*`. The ECS task definition reads them from there as `EMAIL_*`.

### First-time apply

1. **Pick a sender.** Edit `accounts/stage/ap-southeast-1/region.hcl` and set
   `verified_email` to whatever inbox you control (Gmail is fine for testing). Optionally
   add test recipients in `additional_verified_emails` — required while the account is in
   SES sandbox, because sandbox can only send TO verified addresses.
2. **Apply the layer:**
   ```bash
   cd aws/accounts/stage/ap-southeast-1/ses
   terragrunt apply
   ```
   Terraform creates the SES email identity. AWS emails you a verification link — **click it**
   before sending any test mail, or send attempts will fail with `MessageRejected`.
3. **Re-apply ECS** so the task definition picks up the new SSM secret paths:
   ```bash
   cd ../ecs
   terragrunt apply
   ```
   Then force a new deployment:
   ```bash
   aws ecs update-service \
     --cluster ecs-reservation-stage \
     --service svc-ecs-reservation-stage-api \
     --force-new-deployment \
     --region ap-southeast-1 --profile reservation-stage
   ```
4. **Smoke test.** Hit the API's signup endpoint (or trigger any flow that calls
   `send_template_email`); the recipient should receive the message within seconds.
   Check CloudWatch logs of the `api` service if it doesn't land.

### Going to production

By default SES accounts are in **sandbox**: max 200 messages/day, only verified recipients.
To leave sandbox, in the SES console click **Account dashboard → Request production access**
(use the description: *"Transactional email for a reservation platform — signup OTPs, password
reset links, booking confirmations; single-opt-in only, no marketing."*). Approval is usually
under 24 hours.

When you add a domain (post-Route53):
- Add an `aws_ses_domain_identity` + `aws_ses_domain_dkim` to `layers/ses/main.tf`
- Add the three DKIM CNAME records to your hosted zone
- Switch `verified_email` over to an address on the verified domain (e.g. `noreply@yourdomain.com`)
- Remove `additional_verified_emails` (no longer needed once out of sandbox)

### Rotating SMTP credentials

`terraform taint` the access key and re-apply:
```bash
cd aws/accounts/stage/ap-southeast-1/ses
terragrunt apply -replace='aws_iam_access_key.smtp'
cd ../ecs && terragrunt apply   # picks up the new password from SSM
```

## Connecting to staging Postgres from your laptop

Stage RDS can be exposed on a public endpoint for local DB tooling (psql, TablePlus,
local Django). It stays gated by the security group — only the VPC and the IPs you
allowlist get through. **This is a non-prod convenience; never do this for prod.**

### One-time setup

1. **Find your public IP:**
   ```bash
   curl -s https://checkip.amazonaws.com
   ```
2. **Allowlist it.** Edit [accounts/stage/ap-southeast-1/region.hcl](accounts/stage/ap-southeast-1/region.hcl):
   ```hcl
   create_database_internet_gateway_route = true        # in the VPC block
   rds_publicly_accessible                 = true        # in the RDS block
   db_allowed_cidrs                        = ["203.0.113.7/32"]  # ← your IP from step 1
   ```
   Keep it a tight `/32`. Never `0.0.0.0/0`.
3. **Apply networking first, then rds — order matters:**
   ```bash
   cd aws/accounts/stage/ap-southeast-1/networking
   terragrunt apply        # adds the 0.0.0.0/0 → IGW route to the database route table
   cd ../rds
   terragrunt apply        # sets publicly_accessible = true on the instance
   ```
   **Why two layers, in this order:** AWS rejects moving an existing RDS instance to a
   different subnet group in the same VPC (`InvalidVPCNetworkStateFault`). So the DB
   stays in its original database subnet group; public reachability comes from adding an
   internet-gateway route to that route table (the networking layer) plus
   `publicly_accessible = true` (the rds layer). If you run `rds` before `networking`,
   the endpoint gets a public IP but it isn't routable yet — connections will hang until
   `networking` is applied.

   ⚠️ Review the rds plan. Toggling `publicly_accessible` is an **in-place modify with a
   brief connection blip**, not a replacement — confirm the plan says `~ update`, not
   `-/+ replace`, before approving. Stage has `skip_final_snapshot = true` and no
   deletion protection, so a surprise replace would lose data.

### Connect

Pull the credentials from SSM (the rds layer wrote them there):

```bash
PROFILE=reservation-stage; REGION=ap-southeast-1
HOST=$(aws ssm get-parameter --name /reservation/stage/rds_host --query 'Parameter.Value' --output text --region $REGION --profile $PROFILE)
USER=$(aws ssm get-parameter --name /reservation/stage/rds_username --query 'Parameter.Value' --output text --region $REGION --profile $PROFILE)
PASS=$(aws ssm get-parameter --name /reservation/stage/rds_password --with-decryption --query 'Parameter.Value' --output text --region $REGION --profile $PROFILE)
DB=$(aws ssm get-parameter --name /reservation/stage/rds_db_name --query 'Parameter.Value' --output text --region $REGION --profile $PROFILE)

PGPASSWORD="$PASS" psql "host=$HOST port=5432 dbname=$DB user=$USER sslmode=require"
```

`sslmode=require` is mandatory — RDS rejects plaintext. For local Django, use the
prebuilt connection URL (already SSL-required):

```bash
aws ssm get-parameter --name /reservation/stage/rds_connection_url --with-decryption \
  --query 'Parameter.Value' --output text --region $REGION --profile $PROFILE
```

### When your IP changes

Home/office IPs rotate. When you can't connect, re-check `curl -s https://checkip.amazonaws.com`,
update `db_allowed_cidrs`, and re-apply the rds layer (SG-only change, ~10s, no DB restart).

### Locking it back down

Set `rds_publicly_accessible = false` and empty `db_allowed_cidrs`, `terragrunt apply`
the **rds** layer first (drops the public IP while the IGW route still exists), then set
`create_database_internet_gateway_route = false` and `terragrunt apply` the **networking**
layer. Reverse order of the setup — the DB returns to fully private.

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
