resource "aws_ssm_parameter" "this" {
  for_each = local.ssm_params_map

  name      = each.value.name
  type      = each.value.type
  value     = each.value.value
  overwrite = true

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secret_params_map
  name     = each.key
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each      = aws_secretsmanager_secret.this
  secret_id     = each.value.id
  secret_string = local.secret_params_map[each.key]

  lifecycle {
    ignore_changes = [secret_string]
  }
}
