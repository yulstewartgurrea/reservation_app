terraform {
  source = "${dirname(find_in_parent_folders("terragrunt_base.hcl"))}/../layers/${basename(get_terragrunt_dir())}///"
}

dependency "networking" {
  config_path = "../networking"

  mock_outputs = {
    vpc = {
      vpc_id                     = "vpc-00000000"
      vpc_cidr_block             = "10.0.0.0/16"
      database_subnet_group_name = "dummy"
      database_subnets           = ["subnet-00000001", "subnet-00000002"]
    }
  }
}

inputs = {
  vpc_id               = dependency.networking.outputs.vpc.vpc_id
  vpc_cidr             = dependency.networking.outputs.vpc.vpc_cidr_block
  db_subnet_group_name = dependency.networking.outputs.vpc.database_subnet_group_name
  database_subnet_ids  = dependency.networking.outputs.vpc.database_subnets
}
