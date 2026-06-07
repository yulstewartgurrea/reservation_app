# ---------------------------------------------------------------------------
# Public hosted zone for the registered domain (bookme.ph), bought at dot.ph.
#
# Single-account model: ONE zone serves every environment. Records are written
# into it by each env's frontend_hosting layer:
#   bookme.ph / www.bookme.ph  -> prod  CloudFront
#   staging.bookme.ph        -> stage CloudFront
#
# Apply order:
#   1) Apply this layer (stage account).
#   2) Copy the four servers from the `name_servers` output into the dot.ph
#      dashboard: Manage -> bookme.ph -> Nameservers (replace dot.ph's defaults).
#   3) Apply frontend_hosting (stage now; prod once its stack exists). Each
#      reads this zone's id and adds its ACM-validation + alias records.
#
# DNS goes live minutes-to-a-few-hours after the dot.ph nameserver change
# propagates. ACM DNS validation then completes automatically.
# ---------------------------------------------------------------------------
resource "aws_route53_zone" "root" {
  name    = var.root_domain
  comment = "${var.project_name} — registered at dot.ph; NS delegated from the dot.ph dashboard"
}

# ---------------------------------------------------------------------------
# SES domain identity for the root domain (account-wide).
#
# Lives here (not in the `ses` layer) because:
#   - One SES identity per (account, domain) — stage and prod share the same
#     AWS account, so creating it in each env's `ses` layer would collide.
#   - The verification + DKIM records belong in the same hosted zone this
#     layer already owns, so co-locating them avoids a cross-layer dependency.
#
# Both envs' per-env `ses` layers then create their own IAM user + SMTP creds
# and send AS this shared identity (default From: noreply@bookme.ph).
# ---------------------------------------------------------------------------
resource "aws_sesv2_email_identity" "root_domain" {
  email_identity = var.root_domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# DKIM CNAMEs — SES verifies domain ownership once these resolve, and
# receiving mail servers use them to validate DKIM signatures on outbound mail.
resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = aws_route53_zone.root.zone_id
  name    = "${aws_sesv2_email_identity.root_domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.root_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.root_domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# DMARC — "p=quarantine": unauthenticated mail claiming to be @bookme.ph is sent
# to the recipient's spam folder. Safe now that the bookme.ph SES domain identity
# is DKIM-verified (Successful) and SES is the only sender. Tighten to "p=reject"
# once you've confirmed over time that no legitimate 3rd-party sends as @bookme.ph.
resource "aws_route53_record" "ses_dmarc" {
  zone_id = aws_route53_zone.root.zone_id
  name    = "_dmarc.${var.root_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=quarantine;"]
}

# ---------------------------------------------------------------------------
# Resend email-sending DNS for bookme.ph (https://resend.com/domains).
#
# Optional, additive, and off by default: nothing is created until you paste the
# dashboard's records into `resend_verify_records` (in global.hcl). They coexist
# with the SES records above without conflict — Resend's SPF/MX live on the
# `send.*` MAIL FROM subdomain (not the apex), Resend's DKIM uses the `resend`
# selector (SES uses its own token selectors), and the `_dmarc` record is shared.
#
# MX values in Route 53 carry the priority inline ("10 host"), so we prepend it
# for type=MX; TXT/CNAME pass through as-is.
# ---------------------------------------------------------------------------
resource "aws_route53_record" "resend" {
  for_each = { for r in var.resend_verify_records : "${r.type}:${r.name}" => r }

  zone_id = aws_route53_zone.root.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = each.value.ttl
  records = [
    each.value.type == "MX" && each.value.priority != null
    ? "${each.value.priority} ${each.value.value}"
    : each.value.value
  ]
}
