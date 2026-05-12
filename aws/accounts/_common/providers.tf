provider "aws" {
  region  = var.aws_region
  profile = length(var.profile_name) > 0 ? var.profile_name : null

  allowed_account_ids = [var.account_id]

  default_tags {
    tags = var.common_tags
  }
}

# us-east-1 alias is required for ACM certs used by CloudFront. Kept for forward compatibility.
provider "aws" {
  alias   = "us-east-1"
  region  = "us-east-1"
  profile = length(var.profile_name) > 0 ? var.profile_name : null

  allowed_account_ids = [var.account_id]

  default_tags {
    tags = var.common_tags
  }
}
