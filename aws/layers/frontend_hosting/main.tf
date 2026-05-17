locals {
  bucket_name = var.frontend_bucket_name
  oac_name    = "oac-${var.project_name}-${var.env}-frontend"
  cdn_comment = "${var.project_name}-${var.env} frontend"
}

# ---------------------------------------------------------------------------
# S3 bucket — private, encrypted, locked behind CloudFront via OAC.
# ---------------------------------------------------------------------------
module "frontend_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 5.2"

  bucket        = local.bucket_name
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

# Bucket policy: only the CloudFront distribution (via OAC) can read objects.
data "aws_iam_policy_document" "frontend_bucket_policy" {
  statement {
    sid     = "AllowCloudFrontServicePrincipalReadOnly"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = ["${module.frontend_bucket.s3_bucket_arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = module.frontend_bucket.s3_bucket_id
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json
}

# ---------------------------------------------------------------------------
# CloudFront — Origin Access Control (OAC, replaces the legacy OAI).
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = local.oac_name
  description                       = "OAC for ${local.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

locals {
  has_backend       = var.backend_alb_arn != "" && var.backend_alb_dns_name != ""
  backend_origin_id = "alb-backend-${var.env}"

  # Managed cache/origin-request policy IDs (global, stable).
  managed_caching_disabled_policy_id  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  managed_caching_optimized_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  managed_all_viewer_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
}

# CloudFront VPC Origin — gives the distribution a route into the VPC so it can
# reach the internal ALB without ever making the ALB internet-facing. Requires
# AWS provider ≥ 5.74 (see versions_override.tf).
# Viewer-request URL rewriter: maps /verify-otp → /verify-otp.html so direct hits
# / refreshes / external links to static pages get the right S3 object instead of
# falling through to the SPA /index.html fallback (which then crashes because the
# root redirects to /shops). Dynamic routes (/shops/123) still flow through the
# 403/404 → /index.html fallback for client-side routing.
resource "aws_cloudfront_function" "rewrite_html" {
  name    = "rewrite-html-${var.project_name}-${var.env}"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite extensionless URIs to .html (and dynamic IDs to '_') for static Next.js export"
  publish = true
  # Tests for this function: aws/layers/frontend_hosting/test_rewrite_html.mjs
  # Run `node aws/layers/frontend_hosting/test_rewrite_html.mjs` after edits.
  code = <<-EOT
    function handler(event) {
      var req = event.request;
      var uri = req.uri;

      // /api/ and /ws/ go to the ALB origin — leave untouched.
      if (uri.startsWith('/api/') || uri.startsWith('/ws/')) {
        return req;
      }

      // Already a real file (has extension like .html/.js/.css/.png/...) — pass through.
      if (/\.[a-zA-Z0-9]+$/.test(uri)) {
        return req;
      }

      // Normalize trailing slash, then handle the root.
      var trimmed = uri.endsWith('/') ? uri.slice(0, -1) : uri;
      if (trimmed === '') {
        req.uri = '/index.html';
        return req;
      }

      // Replace every all-numeric path segment with "_" — Next.js's static
      // export emits dynamic routes under that placeholder via
      // generateStaticParams() => [{ id: '_' }]. e.g.
      //   /my-shops/123             -> /my-shops/_.html
      //   /my-shops/1/services      -> /my-shops/_/services.html
      //   /my-shops/1/staff/2/hours -> /my-shops/_/staff/_/hours.html
      //   /my-shops/new             -> /my-shops/new.html  (not numeric, stays static)
      // Trade-off: assumes dynamic segments are numeric DB IDs. If slug/UUID
      // routes are added later, broaden this regex.
      var normalized = trimmed.replace(/\/[0-9]+(?=\/|$)/g, '/_');
      req.uri = normalized + '.html';
      return req;
    }
  EOT
}

resource "aws_cloudfront_vpc_origin" "backend" {
  count = local.has_backend ? 1 : 0

  vpc_origin_endpoint_config {
    name                   = "vpc-origin-${var.project_name}-${var.env}-api"
    arn                    = var.backend_alb_arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = local.cdn_comment
  default_root_object = "index.html"
  price_class         = var.frontend_price_class
  aliases             = var.frontend_cloudfront_alias
  http_version        = "http2"

  origin {
    domain_name              = module.frontend_bucket.s3_bucket_bucket_regional_domain_name
    origin_id                = "s3-${local.bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Backend ALB origin (private, via VPC Origin). Only added when the ecs layer
  # has been applied and exported its ALB info.
  dynamic "origin" {
    for_each = local.has_backend ? [1] : []
    content {
      domain_name = var.backend_alb_dns_name
      origin_id   = local.backend_origin_id

      vpc_origin_config {
        vpc_origin_id = aws_cloudfront_vpc_origin.backend[0].id
      }
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-${local.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed "CachingOptimized" policy — handles GET caching with sensible defaults.
    cache_policy_id = local.managed_caching_optimized_policy_id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite_html.arn
    }
  }

  # /api/* → Django HTTP. No caching (responses are user-specific / dynamic);
  # forward all headers, cookies, query strings via the AllViewer managed policy
  # so JWT auth, CSRF, and DRF content negotiation work end-to-end.
  dynamic "ordered_cache_behavior" {
    for_each = local.has_backend ? [1] : []
    content {
      path_pattern             = var.backend_api_path_pattern
      target_origin_id         = local.backend_origin_id
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      compress                 = true
      cache_policy_id          = local.managed_caching_disabled_policy_id
      origin_request_policy_id = local.managed_all_viewer_request_policy_id
    }
  }

  # /ws/* → Django Channels WebSocket. CloudFront supports the HTTP→WS upgrade
  # natively; same origin policy as /api/*.
  dynamic "ordered_cache_behavior" {
    for_each = local.has_backend ? [1] : []
    content {
      path_pattern             = var.backend_ws_path_pattern
      target_origin_id         = local.backend_origin_id
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS"]
      cached_methods           = ["GET", "HEAD"]
      compress                 = false
      cache_policy_id          = local.managed_caching_disabled_policy_id
      origin_request_policy_id = local.managed_all_viewer_request_policy_id
    }
  }

  # SPA-style fallback: Next.js static export emits per-route .html files, but client-side
  # navigation to unknown paths (or a hard refresh on a dynamic route) returns 403/404 from S3.
  # Rewrite those to /index.html so the app can boot and route client-side.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = length(var.frontend_cloudfront_alias) == 0
    acm_certificate_arn            = length(var.frontend_cloudfront_alias) > 0 ? null : null
    ssl_support_method             = length(var.frontend_cloudfront_alias) > 0 ? "sni-only" : null
    minimum_protocol_version       = length(var.frontend_cloudfront_alias) > 0 ? "TLSv1.2_2021" : null
  }
}

# ---------------------------------------------------------------------------
# GitHub Actions OIDC — federated trust + per-env deploy role.
#
# AWS supports at most ONE OIDC provider for token.actions.githubusercontent.com per
# account. The stage env creates it; prod reuses by passing github_oidc_provider_arn.
# ---------------------------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  count = var.github_oidc_provider_arn == "" ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  oidc_provider_arn = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  github_subs = [
    for env in var.github_environments : "repo:${var.github_repo}:environment:${env}"
  ]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Only the configured repo + branches/tags may assume this role.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subs
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "iam-role-${var.project_name}-${var.env}-frontend-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid    = "S3SyncFrontendBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [module.frontend_bucket.s3_bucket_arn]
  }

  statement {
    sid    = "S3WriteFrontendBucket"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:PutObjectAcl",
    ]
    resources = ["${module.frontend_bucket.s3_bucket_arn}/*"]
  }

  statement {
    sid    = "CloudFrontInvalidate"
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:ListInvalidations",
      "cloudfront:GetDistribution",
    ]
    resources = [aws_cloudfront_distribution.frontend.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "policy-${var.project_name}-${var.env}-frontend-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
