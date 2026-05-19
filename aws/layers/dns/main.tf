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
