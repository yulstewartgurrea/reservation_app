terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

dependency "networking" {
  config_path = "../networking"

  mock_outputs = {
    vpc = {
      vpc_id                      = "vpc-00000000"
      vpc_cidr_block              = "10.0.0.0/16"
      private_subnets             = ["subnet-00000001", "subnet-00000002"]
      private_subnets_cidr_blocks = ["10.0.0.0/24", "10.0.1.0/24"]
      database_subnets            = ["subnet-00000003", "subnet-00000004"]
    }
  }
}

inputs = {
  vpc_id                      = dependency.networking.outputs.vpc.vpc_id
  vpc_cidr                    = dependency.networking.outputs.vpc.vpc_cidr_block
  private_subnet_ids          = dependency.networking.outputs.vpc.private_subnets
  private_subnets_cidr_blocks = dependency.networking.outputs.vpc.private_subnets_cidr_blocks
  database_subnet_ids         = dependency.networking.outputs.vpc.database_subnets
}
