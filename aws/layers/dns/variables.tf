variable "env" {}

variable "project_name" {
  type    = string
  default = ""
}

variable "root_domain" {
  description = "Apex domain registered at dot.ph (e.g. bookme.ph). One public hosted zone is created for it; every env's subdomain lives inside this single zone."
  type        = string
}

variable "resend_verify_records" {
  description = <<-EOT
    DNS records Resend lists after you add the bookme.ph domain at
    https://resend.com/domains. Resend runs on AWS SES, so it asks for its OWN
    DKIM key plus a MAIL FROM subdomain (typically send.bookme.ph) with an SPF
    TXT and an MX. The DKIM public key is generated per-domain and cannot be
    known ahead of time, so paste the dashboard's records here verbatim rather
    than hardcoding them. Empty list (the default) = Resend not configured yet;
    no records are created and SES is unaffected. Set this in global.hcl since
    the bookme.ph zone is account-global. For MX entries, set `priority`; for
    TXT/CNAME leave it null. Paste TXT values WITHOUT surrounding quotes.
  EOT
  type = list(object({
    name     = string # exact host as shown, e.g. "send.bookme.ph" or "resend._domainkey.bookme.ph"
    type     = string # "TXT" | "MX" | "CNAME"
    value    = string # exact value from the dashboard
    ttl      = optional(number, 600)
    priority = optional(number) # MX only; null otherwise
  }))
  default = []
}
