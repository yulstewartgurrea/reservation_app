output "s3_private_buckets" {
  value = { for k, v in module.s3_private : k => { id = v.s3_bucket_id, arn = v.s3_bucket_arn } }
}

output "s3_public_buckets" {
  value = { for k, v in module.s3_public : k => { id = v.s3_bucket_id, arn = v.s3_bucket_arn } }
}
