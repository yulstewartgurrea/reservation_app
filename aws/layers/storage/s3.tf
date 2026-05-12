module "s3_private" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 5.2"

  for_each = toset(var.bucket_names_private)

  bucket        = each.key
  force_destroy = true

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  server_side_encryption_configuration = {
    rule = {
      bucket_key_enabled = true
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  versioning = {
    enabled = true
  }
}

module "s3_public" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 5.2"

  for_each = toset(var.bucket_names_public)

  bucket        = each.key
  force_destroy = true

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false

  server_side_encryption_configuration = {
    rule = {
      bucket_key_enabled = true
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }
}
