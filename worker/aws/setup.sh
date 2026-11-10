#!/usr/bin/env bash
# One-time AWS setup for the ECS worker. Run in AWS CloudShell (us-west-1), after uploading .env.modal:
#
#     bash setup.sh .env.modal   (a rerun can pass /dev/null: settings stored earlier are kept)
#
# Safe to rerun: existing resources are kept, settings and the task definition are updated.
# Creates: SSM parameters (the worker's settings, encrypted), an ECR repository, a log group, an ECS cluster
# with Fargate Spot, the task definition, a role GitHub Actions assumes to push images, and an IAM user whose
# only right is starting this task (its keys go into Vercel so the site can wake the worker).
set -euo pipefail

REGION=us-west-1 # next to the Supabase database
NAME=lecture-copilot
# GitHub names the repo by owner and repo ids too (immutable subject), so a recreated repo of the same name gets no access
GITHUB_REPO=monishpatalay@106901576/lecture-copilot@1406506631
ENV_FILE=${1:?usage: bash setup.sh path/to/.env.modal}
REQUIRED="DATABASE_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY GEMINI_API_KEY GROQ_API_KEY"
OPTIONAL="RESEND_API_KEY EMAIL_FROM SITE_URL" # the "lecture is ready" email; skipped when absent

export AWS_DEFAULT_REGION=$REGION
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
quietly() { "$@" >/dev/null 2>&1 || true; } # for create calls whose resource may already exist

# ── settings → SSM Parameter Store (standard SecureString: free) ──
value_of() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }
SECRETS="["
for var in $REQUIRED $OPTIONAL; do
  value=$(value_of "$var" || true)
  if [ -n "$value" ]; then
    aws ssm put-parameter --name "/$NAME/$var" --type SecureString --value "$value" --overwrite >/dev/null
  elif ! aws ssm get-parameter --name "/$NAME/$var" >/dev/null 2>&1; then # stored by an earlier run: keep it
    case " $REQUIRED " in *" $var "*) echo "missing $var in $ENV_FILE" >&2; exit 1 ;; esac
    echo "  $var not set: skipped"
    continue
  fi
  SECRETS+="{\"name\":\"$var\",\"valueFrom\":\"arn:aws:ssm:$REGION:$ACCOUNT:parameter/$NAME/$var\"},"
done
SECRETS="${SECRETS%,}]"
echo "✓ settings stored"

# ── image registry, keeping the last 3 images (stays inside the free 500 MB) ──
quietly aws ecr create-repository --repository-name $NAME
aws ecr put-lifecycle-policy --repository-name $NAME --lifecycle-policy-text \
  '{"rules":[{"rulePriority":1,"selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":3},"action":{"type":"expire"}}]}' >/dev/null
quietly aws logs create-log-group --log-group-name /ecs/$NAME
aws logs put-retention-policy --log-group-name /ecs/$NAME --retention-in-days 14
echo "✓ registry and logs"

# ── the role ECS uses to pull the image, read the settings and write logs ──
quietly aws iam create-role --role-name $NAME-ecs-execution --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name $NAME-ecs-execution --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name $NAME-ecs-execution --policy-name read-settings --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"ssm:GetParameters\",\"Resource\":\"arn:aws:ssm:$REGION:$ACCOUNT:parameter/$NAME/*\"}]}"
EXECUTION_ROLE=arn:aws:iam::$ACCOUNT:role/$NAME-ecs-execution
echo "✓ execution role"

# ── cluster and task definition: 4 vCPU / 8 GB, Fargate Spot, 2-hour lectures fit in 30 GB of disk ──
quietly aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com
for attempt in 1 2 3 4 5 6; do # a just-created service-linked role takes a little while to become usable
  aws ecs create-cluster --cluster-name $NAME --capacity-providers FARGATE FARGATE_SPOT \
    --default-capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1 >/dev/null && break
  [ $attempt = 6 ] && exit 1
  sleep 15
done
aws ecs register-task-definition --cli-input-json "{
  \"family\": \"$NAME\",
  \"requiresCompatibilities\": [\"FARGATE\"],
  \"networkMode\": \"awsvpc\",
  \"cpu\": \"4096\", \"memory\": \"8192\",
  \"ephemeralStorage\": {\"sizeInGiB\": 30},
  \"runtimePlatform\": {\"cpuArchitecture\": \"X86_64\", \"operatingSystemFamily\": \"LINUX\"},
  \"executionRoleArn\": \"$EXECUTION_ROLE\",
  \"containerDefinitions\": [{
    \"name\": \"worker\",
    \"image\": \"$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$NAME:latest\",
    \"essential\": true,
    \"stopTimeout\": 120,
    \"secrets\": $SECRETS,
    \"logConfiguration\": {\"logDriver\": \"awslogs\", \"options\": {
      \"awslogs-group\": \"/ecs/$NAME\", \"awslogs-region\": \"$REGION\", \"awslogs-stream-prefix\": \"worker\"}}
  }]
}" >/dev/null
echo "✓ cluster and task definition"

# ── GitHub Actions pushes images by assuming this role (no stored AWS keys in GitHub) ──
quietly aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
GITHUB_TRUST="{
  \"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",
  \"Principal\":{\"Federated\":\"arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com\"},
  \"Action\":\"sts:AssumeRoleWithWebIdentity\",
  \"Condition\":{\"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\",
    \"token.actions.githubusercontent.com:sub\":\"repo:$GITHUB_REPO:ref:refs/heads/main\"}}}]}"
quietly aws iam create-role --role-name $NAME-github --assume-role-policy-document "$GITHUB_TRUST"
aws iam update-assume-role-policy --role-name $NAME-github --policy-document "$GITHUB_TRUST" # a rerun applies changes
aws iam put-role-policy --role-name $NAME-github --policy-name push-image --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchCheckLayerAvailability\",\"ecr:BatchGetImage\",\"ecr:InitiateLayerUpload\",
    \"ecr:UploadLayerPart\",\"ecr:CompleteLayerUpload\",\"ecr:PutImage\"],
   \"Resource\":\"arn:aws:ecr:$REGION:$ACCOUNT:repository/$NAME\"}]}"
echo "✓ GitHub role"

# ── the site's key: may start this one task and nothing else ──
quietly aws iam create-user --user-name $NAME-vercel
aws iam put-user-policy --user-name $NAME-vercel --policy-name run-worker --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":\"ecs:RunTask\",\"Resource\":\"arn:aws:ecs:$REGION:$ACCOUNT:task-definition/$NAME:*\",
   \"Condition\":{\"ArnEquals\":{\"ecs:cluster\":\"arn:aws:ecs:$REGION:$ACCOUNT:cluster/$NAME\"}}},
  {\"Effect\":\"Allow\",\"Action\":\"iam:PassRole\",\"Resource\":\"$EXECUTION_ROLE\"}]}"
echo "✓ site user"

# ── network: the default VPC's public subnets; the default security group allows outbound traffic only ──
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
if [ "$VPC" = "None" ]; then VPC=$(aws ec2 create-default-vpc --query Vpc.VpcId --output text); fi
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SG=$(aws ec2 describe-security-groups --filters Name=vpc-id,Values=$VPC Name=group-name,Values=default --query 'SecurityGroups[0].GroupId' --output text)

echo
echo "GitHub repository variable  AWS_ROLE_ARN = arn:aws:iam::$ACCOUNT:role/$NAME-github"
echo "Vercel  ECS_SUBNETS        = $SUBNETS"
echo "Vercel  ECS_SECURITY_GROUP = $SG"
echo "Vercel  ECS_ACCESS_KEY_ID / ECS_SECRET_ACCESS_KEY: create an access key for the IAM user $NAME-vercel in the console"
