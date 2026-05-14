# SES configuration for transactional email (signup OTPs, password resets,
# booking confirmations, maintenance reminders).
#
# What this layer creates:
#   - SES email identity for the sender address (required while not on a verified domain)
#   - Optional extra recipient identities (sandbox mode only sends to verified addresses)
#   - IAM user with ses:SendRawEmail permission
#   - IAM access key (provides the SES SMTP password via the v4 derivation)
#   - Optional SSM parameters under /<project>/<env>/ses/* so ECS can read the creds
#
# Going to production:
#   1. Run `aws ses put-account-details` or use the SES console "Request production access"
#      so the account leaves sandbox.
#   2. Verify a domain (separate add-on; needs Route53 DKIM CNAMEs) and remove the
#      per-recipient verifications below.

data "aws_region" "current" {}

# -----------------------------------------------------------------------------
# Verified sender (and optional recipients while in sandbox)
# -----------------------------------------------------------------------------
resource "aws_ses_email_identity" "sender" {
  email = var.verified_email
}

resource "aws_ses_email_identity" "additional_recipients" {
  for_each = toset(var.additional_verified_emails)
  email    = each.value
}

# -----------------------------------------------------------------------------
# IAM user that the app uses to send via SMTP
# -----------------------------------------------------------------------------
resource "aws_iam_user" "smtp" {
  name = "iam-${var.project_name}-${var.env}-ses-smtp"
  path = "/system/"
  tags = {
    purpose = "ses-smtp-sender"
  }
}

data "aws_iam_policy_document" "send_email" {
  statement {
    sid    = "AllowSESSend"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_user_policy" "smtp" {
  name   = "ses-smtp-send"
  user   = aws_iam_user.smtp.name
  policy = data.aws_iam_policy_document.send_email.json
}

resource "aws_iam_access_key" "smtp" {
  user = aws_iam_user.smtp.name
}

# -----------------------------------------------------------------------------
# SSM parameters — so ECS and local tooling can pull creds without copy/paste.
# Names are namespaced under /<project>/<env>/ses/ to avoid colliding with the
# placeholder EMAIL_* params created by the `parameters` layer (those stay as
# defaults; the ecs task definition is rewired in region.hcl to read from these
# SES-specific paths instead).
# -----------------------------------------------------------------------------
locals {
  ssm_prefix   = "/${var.project_name}/${var.env}/ses"
  smtp_host    = "email-smtp.${data.aws_region.current.name}.amazonaws.com"
  smtp_port    = "587"
  default_from = length(var.from_email_display) > 0 ? var.from_email_display : "Reserva <${var.verified_email}>"
}

resource "aws_ssm_parameter" "smtp_host" {
  count     = var.write_smtp_creds_to_ssm ? 1 : 0
  name      = "${local.ssm_prefix}/smtp_host"
  type      = "String"
  value     = local.smtp_host
  overwrite = true
}

resource "aws_ssm_parameter" "smtp_port" {
  count     = var.write_smtp_creds_to_ssm ? 1 : 0
  name      = "${local.ssm_prefix}/smtp_port"
  type      = "String"
  value     = local.smtp_port
  overwrite = true
}

resource "aws_ssm_parameter" "smtp_username" {
  count     = var.write_smtp_creds_to_ssm ? 1 : 0
  name      = "${local.ssm_prefix}/smtp_username"
  type      = "SecureString"
  value     = aws_iam_access_key.smtp.id
  overwrite = true
}

resource "aws_ssm_parameter" "smtp_password" {
  count     = var.write_smtp_creds_to_ssm ? 1 : 0
  name      = "${local.ssm_prefix}/smtp_password"
  type      = "SecureString"
  value     = aws_iam_access_key.smtp.ses_smtp_password_v4
  overwrite = true
}

resource "aws_ssm_parameter" "default_from_email" {
  count     = var.write_smtp_creds_to_ssm ? 1 : 0
  name      = "${local.ssm_prefix}/default_from_email"
  type      = "String"
  value     = local.default_from
  overwrite = true
}

resource "aws_ssm_parameter" "email_backend" {
  count     = var.write_smtp_creds_to_ssm ? 1 : 0
  name      = "${local.ssm_prefix}/email_backend"
  type      = "String"
  value     = "django.core.mail.backends.smtp.EmailBackend"
  overwrite = true
}

resource "aws_ssm_parameter" "email_use_tls" {
  count     = var.write_smtp_creds_to_ssm ? 1 : 0
  name      = "${local.ssm_prefix}/email_use_tls"
  type      = "String"
  value     = "True"
  overwrite = true
}
