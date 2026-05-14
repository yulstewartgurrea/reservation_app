variable "env" {
  type = string
}

variable "project_name" {
  type    = string
  default = "reservation"
}

variable "verified_email" {
  description = "Email address that will be verified as a sender. Until SES production access is granted, this is also the only address you can send TO."
  type        = string
}

variable "additional_verified_emails" {
  description = "Extra recipient addresses to verify while still in SES sandbox (e.g. test inboxes). Empty in prod."
  type        = list(string)
  default     = []
}

variable "from_email_display" {
  description = "Display form of the From: header, e.g. 'BookMe <noreply@example.com>'. If empty, falls back to the verified_email."
  type        = string
  default     = ""
}

variable "write_smtp_creds_to_ssm" {
  description = "If true, the SMTP host / username / password are written into SSM parameters under /<project>/<env>/ses/* so the ECS task can pull them. Leave false if you prefer to copy the outputs in manually."
  type        = bool
  default     = true
}
