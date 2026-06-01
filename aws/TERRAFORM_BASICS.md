# Terraform Basics — Explained Like You're in High School

Welcome! This guide teaches you Terraform from zero. No prior cloud or DevOps knowledge needed. By the end you'll understand what's happening in this repo's `aws/` folder.

---

## 1. What problem does Terraform solve?

Imagine you want to launch a website. You need:

- A **server** to run the code
- A **database** to store users and reservations
- A **domain name** so people can visit it
- **Networking** so all those pieces can talk to each other

You could log into AWS (Amazon Web Services), click through 50 different web pages, and set all that up by hand. That's called **ClickOps**. It's slow, error-prone, and impossible to repeat.

Now imagine instead you write a recipe in a text file that says:

> "I want one server, one database, one domain. Here's how they connect."

Then you run a single command and the recipe builds everything automatically. That's **Terraform**.

This idea has a fancy name: **Infrastructure as Code (IaC)**. Your servers, networks, and databases are defined in files you can save in Git, just like your app code.

---

## 2. What Terraform actually is

Terraform is a free tool made by HashiCorp. You write `.tf` files describing what you want, and Terraform talks to cloud providers (AWS, Google Cloud, Azure, etc.) to make it real.

Think of it like ordering at a restaurant:
- **You** (the customer) write the order on a napkin → these are your `.tf` files.
- **Terraform** (the waiter) takes your order and tells the kitchen what to make.
- **AWS** (the kitchen) actually cooks the food → spins up the servers.

If you change your napkin (edit `.tf` files), Terraform figures out the difference and only tells the kitchen to change what's different. It doesn't re-cook everything from scratch.

---

## 3. The four words you need to know

### Provider
The cloud you're using. For us, it's `aws`.

```hcl
provider "aws" {
  region = "ap-southeast-1"  # Singapore
}
```

### Resource
A thing you want to create — a server, a database, a bucket of files. Each resource has a **type** and a **name** you make up.

```hcl
resource "aws_s3_bucket" "my_photos" {
  bucket = "yul-vacation-photos-2026"
}
```

Translation: "Hey AWS, create an S3 bucket (cloud folder for files) and call it `yul-vacation-photos-2026`. In my Terraform code I'll refer to it as `my_photos`."

### Variable
A value you can change without rewriting the whole file. Like a slot you fill in.

```hcl
variable "environment" {
  default = "staging"
}

resource "aws_s3_bucket" "logs" {
  bucket = "myapp-logs-${var.environment}"
}
```

If you change `environment` to `"production"`, the bucket name becomes `myapp-logs-production`.

### Output
Something Terraform tells you after it's done. Useful for grabbing URLs, IPs, etc.

```hcl
output "bucket_url" {
  value = aws_s3_bucket.my_photos.bucket_domain_name
}
```

After Terraform finishes, it prints the URL of your new bucket.

---

## 4. The workflow — three commands

This is the entire day-to-day:

```bash
terraform init     # Download the AWS plugin. Run once per folder.
terraform plan     # "Show me what you WOULD do, but don't do it yet."
terraform apply    # "OK, actually do it."
```

And one more for when you want to delete everything:

```bash
terraform destroy  # Nuke it all. AWS will stop billing you.
```

**Always run `plan` before `apply`.** It shows a diff — green `+` for things being added, red `-` for things being deleted, yellow `~` for things changing. Read it like a code review of your own infrastructure.

Example plan output:
```
  + aws_s3_bucket.my_photos     # creating new bucket
  ~ aws_instance.web_server     # changing server size
  - aws_db_instance.old_db      # DELETING the database (!!)
```

That `-` is the kind of thing that saves your job. If you didn't mean to delete the database, you can cancel before typing `yes`.

---

## 5. The state file — the one weird trick

Here's the concept that confuses everyone the first time. Terraform needs to remember **what it already built**. Otherwise next time you run `apply`, it would build everything a second time.

It remembers by writing a file called `terraform.tfstate`. This file is a giant JSON that maps "the resource named `my_photos` in my code" → "the actual AWS bucket with ID xyz123".

**Two important rules:**

1. **Never edit the state file by hand.** It's like editing your saved video game file in a hex editor. You'll corrupt it.
2. **Don't lose it.** If you lose the state, Terraform forgets what it built, and you'll have orphan resources still costing money in AWS.

In real teams (like this project), the state file is stored in a shared **S3 bucket** so everyone on the team uses the same one. That's called a **remote backend**.

---

## 6. A tiny full example

Save this as `main.tf`:

```hcl
provider "aws" {
  region = "ap-southeast-1"
}

resource "aws_s3_bucket" "hello" {
  bucket = "my-first-terraform-bucket-2026"
}

output "bucket_name" {
  value = aws_s3_bucket.hello.id
}
```

Then run:
```bash
terraform init
terraform plan
terraform apply
```

Type `yes` when asked. Boom — you just made an S3 bucket in the cloud with code. Run `terraform destroy` to clean it up.

---

## 7. Terragrunt — Terraform's helpful sidekick

Look at this repo's [aws/](aws/) folder. You won't see plain `.tf` files at the top level — you'll see `terragrunt.hcl` files. **Terragrunt** is a wrapper around Terraform that solves an annoying problem.

**The problem:** if you have a `staging` environment and a `production` environment, you don't want to copy-paste the same Terraform code twice. That's how bugs happen.

**Terragrunt's fix:** write the code once, then for each environment write a tiny config file that says "use that code but with these specific values." DRY (Don't Repeat Yourself) for infrastructure.

In this repo:
- [aws/layers/](aws/layers/) — the reusable Terraform code (networking, ECS, RDS, etc.)
- [aws/accounts/stage/](aws/accounts/stage/) — staging-specific values
- [aws/accounts/prod/](aws/accounts/prod/) — production-specific values

So `staging` and `production` share the same code but get their own databases, servers, and domains.

---

## 8. What the layers in this project do

Quick tour so you can read the folder names without panicking:

| Layer | What it builds | Real-world analogy |
|-------|---------------|--------------------|
| `networking` | VPC, subnets, security groups | The walls and doors of the building |
| `rds` | PostgreSQL database | The filing cabinet |
| `redis` | ElastiCache Redis | A sticky-note board for fast lookups |
| `ecr` | Docker image registry | The supply closet for app builds |
| `ecs` | Containers that run the Django backend | The actual employees doing work |
| `frontend_hosting` | S3 + CloudFront for Next.js | The storefront window |
| `ses` | Email sending | The mailroom |
| `parameters` | Secrets and config | The locked drawer with the WiFi password |
| `ci` | GitHub Actions deploy permissions | The keycard for the delivery person |
| `dns` | Domain names | The street address on the front of the building |

Each layer can be built, changed, or destroyed independently. That's the whole point of splitting them.

---

## 9. Common mistakes to avoid

- **Running `apply` without reading `plan`.** You will eventually delete the wrong thing.
- **Committing the `.tfstate` file to Git.** It often contains secrets. Use a remote backend instead. (This repo already does.)
- **Hardcoding passwords in `.tf` files.** Use variables and pass secrets via environment variables or AWS Secrets Manager.
- **Changing the same resource manually in the AWS console AND in Terraform.** They'll fight. Pick one source of truth — and for this project, that's always Terraform.

---

## 10. Where to go next

When you're ready to level up:

1. Read [aws/README.md](README.md) — what this project's infrastructure actually looks like.
2. Read [aws/DOCUMENTATION.md](DOCUMENTATION.md) — the deeper how-and-why.
3. Pick the smallest layer (try [aws/layers/storage/](layers/storage/)) and read every line. It's short.
4. Try the official tutorial at https://developer.hashicorp.com/terraform/tutorials.

That's it. You now know enough Terraform to read this repo and not feel lost. The rest is just more resource types and more practice.
