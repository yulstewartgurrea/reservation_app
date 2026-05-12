locals {
  default_value = "init"

  ssm_params = [
    for p in var.ssm_parameters : {
      name  = p["name"]
      value = length(try(p["value"], "")) > 0 ? p["value"] : local.default_value
      type  = try(p["type"], "String")
    } if contains(keys(p), "name")
  ]
  ssm_params_map = { for p in local.ssm_params : p.name => p }

  secret_params = [
    for s in var.secret_parameters : {
      name  = s["name"]
      value = length(try(s["value"], "")) > 0 ? s["value"] : local.default_value
    } if contains(keys(s), "name")
  ]
  secret_params_map = { for s in local.secret_params : s.name => s.value }
}
