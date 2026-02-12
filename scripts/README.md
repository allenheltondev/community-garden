# Deployment Scripts

This directory contains scripts for deploying the Community Garden Platform infrastructure and frontend.

## Scripts Overview

### `update-frontend-config.sh` / `update-frontend-config.ps1`

Extracts CloudFormation stack outputs and updates the frontend `.env` file with the correct configuration values.

**Usage (Bash):**
```bash
# Use default values from samconfig.toml
./scripts/update-frontend-config.sh

# Specify custom stack name, region, and profile
./scripts/update-frontend-config.sh my-stack-name us-west-2 my-profile
```

**Usage (PowerShell):**
```powershell
# Use default values
.\scripts\update-frontend-config.ps1

# Specify custom parameters
.\scripts\update-frontend-config.ps1 -StackName "my-stack" -Region "us-west-2" -Profile "my-profile"
```

**What it does:**
1. Queries CloudFormation for stack outputs
2. Extracts required values (User Pool ID, API URL, etc.)
3. Creates/updates `frontend/.env` with the correct values

### `ci-deploy.sh`

Complete CI/CD deployment script that handles backend deployment, frontend configuration, build, and S3 deployment.

**Usage:**
```bash
# Deploy to dev environment
./scripts/ci-deploy.sh dev

# Deploy to production (requires DOMAIN_NAME and HOSTED_ZONE_ID env vars)
export DOMAIN_NAME="app.example.com"
export HOSTED_ZONE_ID="Z1234567890ABC"
./scripts/ci-deploy.sh prod
```

**What it does:**
1. Builds and deploys the backend SAM stack
2. Extracts stack outputs
3. Updates frontend configuration
4. Builds the frontend
5. Deploys frontend to S3
6. Invalidates CloudFront cache

**Environment Variables:**
- `AWS_REGION` - AWS region (default: us-east-1)
- `DOMAIN_NAME` - Custom domain for production (required for prod)
- `HOSTED_ZONE_ID` - Route53 hosted zone ID (required for prod)

## Local Development Workflow

1. Deploy the backend:
   ```bash
   cd backend
   sam build
   sam deploy --guided
   ```

2. Update frontend configuration:
   ```bash
   # From project root
   ./scripts/update-frontend-config.sh
   ```

3. Start frontend dev server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Setup SAM CLI
        uses: aws-actions/setup-sam@v2

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Deploy
        run: ./scripts/ci-deploy.sh prod
        env:
          DOMAIN_NAME: ${{ secrets.DOMAIN_NAME }}
          HOSTED_ZONE_ID: ${{ secrets.HOSTED_ZONE_ID }}
```

### GitLab CI Example

```yaml
deploy:
  stage: deploy
  image: public.ecr.aws/sam/build-provided.al2023:latest
  before_script:
    - curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    - apt-get install -y nodejs
  script:
    - ./scripts/ci-deploy.sh prod
  only:
    - main
  variables:
    AWS_REGION: us-east-1
```

## Required AWS Permissions

The deployment scripts require the following AWS permissions:

- CloudFormation: Full access to create/update stacks
- S3: Read/write access to SAM deployment bucket and frontend bucket
- Lambda: Create/update functions
- API Gateway: Create/update APIs
- Cognito: Create/update user pools
- DynamoDB: Create/update tables
- EventBridge: Create/update event buses
- CloudFront: Create/update distributions and invalidate cache
- IAM: Create/update roles and policies
- ACM: Create/validate certificates (for custom domains)
- Route53: Update DNS records (for custom domains)

## Troubleshooting

### Stack outputs not found
If the script fails to retrieve stack outputs, verify:
- The stack name is correct
- The stack deployment completed successfully
- Your AWS credentials have permission to describe stacks

### Frontend build fails
Ensure:
- Node.js 18+ is installed
- Dependencies are installed (`npm install`)
- The `.env` file was created correctly

### S3 sync fails
Check:
- The S3 bucket exists
- Your AWS credentials have write access to the bucket
- The frontend build completed successfully

### CloudFront invalidation fails
Verify:
- The CloudFront distribution exists
- Your AWS credentials have permission to create invalidations
- The distribution is associated with the correct S3 bucket
