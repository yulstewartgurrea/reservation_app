output "ecs_cluster" {
  value = module.ecs_cluster
}

output "ecs_service" {
  value     = module.ecs_service
  sensitive = false
}

output "lb_internal" {
  description = "Map of internal ALB outputs keyed by ECS service name."
  value       = { for k, v in module.alb_internal : k => { dns_name = v.dns_name, arn = v.arn, zone_id = v.zone_id } }
}
