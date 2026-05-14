terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      # 5.74+ adds aws_cloudfront_vpc_origin (used to route /api/* from CloudFront to the internal ALB).
      version = ">= 5.74"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}
