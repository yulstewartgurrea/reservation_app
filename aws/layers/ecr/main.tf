resource "aws_ecr_repository" "app_repo" {
  for_each = var.repositories

  name                 = each.key
  image_tag_mutability = try(each.value.image_tag_mutability, "MUTABLE")
  force_delete         = try(each.value.force_delete, false)

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "expire_untagged" {
  for_each   = aws_ecr_repository.app_repo
  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = { type = "expire" }
      }
    ]
  })
}
