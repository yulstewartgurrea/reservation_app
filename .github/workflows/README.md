# GitHub Actions workflows

| Workflow | Trigger | What it does |
|---|---|---|
| [`backend-deploy.yml`](backend-deploy.yml) | Push to `staging` or `main` touching `backend/` or `aws/`; manual `workflow_dispatch` | Test → build & push image → run Django migrations as one-off ECS task → roll out ECS services |
| [`frontend-deploy.yml`](frontend-deploy.yml) | (frontend workflow — separate scope) | — |

The workflow assumes AWS via **GitHub OIDC** (no long-lived access keys). Setup is documented in
[aws/DOCUMENTATION.md § "CI/CD"](../../aws/DOCUMENTATION.md#13-cicd-with-github-actions).

## Repository configuration required

Before the workflow can run, set these once in the GitHub repo:

1. **Repository variable** `AWS_BACKEND_DEPLOY_ROLE_ARN` (Settings → Secrets and variables → Actions → Variables tab)
   - Value: the `deployer_role_arn` output from the `ci` Terragrunt layer
   - Get it with:
     ```
     cd aws/accounts/stage/ap-southeast-1/ci && terragrunt output -raw deployer_role_arn
     ```

2. **Environment named `staging`** (Settings → Environments → New environment)
   - Matches the `github_environments = ["staging"]` setting in
     [aws/accounts/stage/ap-southeast-1/region.hcl](../../aws/accounts/stage/ap-southeast-1/region.hcl)
   - Optional but recommended: add a required reviewer for manual approval on production-like envs.

## Rollback

Re-run the workflow with `workflow_dispatch` and a previous `image_tag` value (any short SHA that
was previously deployed). The build step skips when an `image_tag` input is provided — it just
verifies the tag exists in ECR and proceeds straight to migrate + deploy.

> Note: rollback runs migrations again. If the previous version's migrations are *forward*-only
> (the new code added migrations that can't be rolled back), you may need to manually revert the
> database too.

## Local testing

You can dry-run the workflow logic locally with [`act`](https://github.com/nektos/act):

```bash
act push -W .github/workflows/backend-deploy.yml --container-architecture linux/amd64
```

But the AWS-touching steps require real OIDC tokens, which `act` can't produce — most useful for
linting the YAML and running the `test` job locally.
