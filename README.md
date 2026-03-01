# Community Food Coordination Platform

A platform connecting growers with surplus food to community members who need it, reducing waste and strengthening local food systems.

## Project Status

**Current Phase**: Phase 0 - Foundations ✅

Phase 0 establishes the foundational infrastructure with authentication, observability, and a deployable skeleton.

### Completed Deliverables

- ✅ Repo scaffold and project structure
- ✅ PWA shell with React + Vite
- ✅ Cognito authentication with JWT
- ✅ Rust API monolambda behind API Gateway
- ✅ Lambda authorizer with tier-based access
- ✅ DynamoDB tables (core and derived)
- ✅ EventBridge custom bus
- ✅ End-to-end correlation ID tracking
- ✅ S3 + CloudFront hosting
- ✅ Structured JSON logging

### Exit Criteria

Phase 0 is complete when:
- ✅ A user can be created in Cognito
- ⏳ User can sign in via PWA on phone (requires deployment)
- ⏳ User can see profile information in PWA (requires deployment)
- ✅ GET /me endpoint returns correct user data
- ✅ All logs include correlation IDs
- ⏳ Infrastructure deploys successfully via SAM (requires AWS deployment)
- ⏳ PWA can be installed to phone home screen (requires deployment)

## Architecture

### High-Level Overview

```
┌─────────────┐
│   Browser   │
│   (PWA)     │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────┐
│   CloudFront    │
│   + S3 Bucket   │
└─────────────────┘

┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS + JWT
       ▼
┌─────────────────┐      ┌──────────────────┐
│  API Gateway    │─────▶│ Lambda Authorizer│
│   (HTTP API)    │      │   (Rust)         │
└────────┬────────┘      └──────────────────┘
         │                        │
         │                        ▼
         │                ┌──────────────┐
         │                │   Cognito    │
         │                │  User Pool   │
         │                └──────────────┘
         ▼
┌─────────────────┐
│  API Lambda     │
│   (Rust)        │
└────────┬────────┘
         │
         ├──────────────┐
         │              │
         ▼              ▼
┌──────────────┐  ┌──────────────┐
│  DynamoDB    │  │ EventBridge  │
│  (Core +     │  │   Bus        │
│   Derived)   │  │              │
└──────────────┘  └──────────────┘
```

### Technology Stack

**Frontend**:
- React 19 with TypeScript
- Vite for build tooling
- AWS Amplify for authentication
- TanStack Query for data fetching
- Tailwind CSS for styling
- PWA with service worker

**Backend**:
- Rust with Lambda runtime
- API Gateway HTTP API
- Lambda authorizer for JWT validation
- DynamoDB for data storage
- EventBridge for domain events
- CloudWatch for logging

**Infrastructure**:
- AWS SAM for IaC
- S3 + CloudFront for frontend hosting
- Cognito for user management

## Project Structure

```
.
├── backend/                    # Rust backend services
│   ├── src/
│   │   ├── api/               # API Lambda function
│   │   │   ├── handlers/      # Route handlers (GET /me)
│   │   │   ├── middleware/    # Correlation ID middleware
│   │   │   ├── models/        # Data models (UserProfile)
│   │   │   ├── main.rs        # Lambda entry point
│   │   │   └── router.rs      # Request routing
│   │   └── auth/
│   │       └── authorizer.rs  # Lambda authorizer
│   ├── tests/                 # Integration tests
│   ├── Cargo.toml             # Rust dependencies
│   └── template.yaml          # SAM template (IaC)
│
├── frontend/                   # React PWA
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── Auth/          # Sign-in component
│   │   │   └── Profile/       # Profile view component
│   │   ├── config/            # Amplify configuration
│   │   ├── hooks/             # Custom hooks (useAuth)
│   │   ├── services/          # API client
│   │   ├── types/             # TypeScript types
│   │   ├── App.tsx            # Root component
│   │   └── main.tsx           # Entry point
│   ├── public/                #
# Project guidance
```

## Getting Started

### Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured (`aws configure`)
- AWS SAM CLI ([installation guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html))
- Rust toolchain with cargo-lambda (`cargo install cargo-lambda`)
- Node.js 18+ and npm
- Git

### CI/CD Setup (Recommended)

For automated deployments via GitHub Actions:

1. **Configure GitHub Secrets** - See [GitHub Actions Setup Guide](./docs/github-actions-setup.md)
2. **Push to main branch** - Automatically deploys to dev environment
3. **Manual deployment** - Use workflow dispatch for staging/prod

The CI/CD pipeline handles:
- Linting and testing on pull requests
- Automated deployment on merge to main
- Frontend configuration from backend outputs
- S3 deployment with cache optimization
- CloudFront cache invalidation

See [CI/CD Quick Reference](./docs/ci-cd-quick-reference.md) for common operations.

### API Idempotency Contract (Phase 5)

Write endpoints support retry-safe behavior using the `Idempotency-Key` request header.

- Reusing the same key for the same authenticated user replays the original successful write response.
- Reusing the same key for a *different* payload that hashes to an existing record owned by another user returns a conflict.
- Current coverage:
  - `POST /requests`
  - `POST /listings`
- Clients should generate a stable UUID-like key per user action attempt and reuse it across retries/timeouts.

### Quick Start (Manual Deployment)

1. **Clone the repository**

```bash
git clone <repository-url>
cd community-garden
```

2. **Deploy backend to AWS**

```bash
cd backend
cargo lambda build --release --arm64
sam deploy --guided
```

Save the stack outputs (API URL, Cognito details, etc.).

3. **Configure and deploy frontend**

```bash
cd frontend
npm install

# Create .env with values from backend deployment
cat > .env << EOF
VITE_USER_POOL_ID=<from SAM output>
VITE_USER_POOL_CLIENT_ID=<from SAM output>
VITE_USER_POOL_DOMAIN=<from SAM output>
VITE_API_URL=<from SAM output>
VITE_FRONTEND_URL=<from SAM output>
VITE_AWS_REGION=us-east-1
EOF

# Build and deploy
npm run build
aws s3 sync dist/ s3://<bucket-name>/ --delete
```

4. **Create a test user**

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username test@example.com \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true Name=given_name,Value=Test Name=family_name,Value=User \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id <USER_POOL_ID> \
  --username test@example.com \
  --password <YOUR_PASSWORD> \
  --permanent

aws cognito-idp admin-add-user-to-group \
  --user-pool-id <USER_POOL_ID> \
  --username test@example.com \
  --group-name neighbor-tier
```

5. **Test the application**

Open the CloudFront URL in your browser and sign in with the test user.

### Local Development

See the [Local Development Guide](./docs/phase-0-local-dev.md) for detailed instructions on running the application locally.

## Documentation

- [Deployment Guide](./docs/phase-0-deployment.md) - Step-by-step deployment instructions
- [Local Development Guide](./docs/phase-0-local-dev.md) - Local development setup and workflow
- [Phase 0 Requirements](./.kiro/specs/phase-0-foundations/requirements.md) - Detailed requirements
- [Phase 0 Design](./.kiro/specs/phase-0-foundations/design.md) - Architecture and design decisions
- [Roadmap](./.kiro/steering/roadmap.md) - Multi-phase development plan

## Features

### Phase 0 (Current)

- **Authentication**: Cognito-based sign-in with email/password
- **User Tiers**: Three membership tiers (neighbor, supporter, caretaker)
- **Profile View**: Display authenticated user's profile information
- **Observability**: Structured JSON logging with correlation ID tracking
- **PWA**: Installable progressive web app optimized for mobile
- **Security**: JWT validation, HTTPS, encrypted data at rest

### Upcoming Phases

- **Phase 1**: Grower listings and availability declarations
- **Phase 2**: Searcher discovery and request submission
- **Phase 3**: Aggregated insights and community signals
- **Phase 4**: AI-assisted guidance and recommendations
- **Phase 5**: Reliability hardening and scaling

## API Endpoints

### GET /me

Returns the authenticated user's profile.

**Authentication**: Required (JWT Bearer token)

**Response**:
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "tier": "neighbor"
}
```

**Headers**:
- `Authorization: Bearer <jwt-token>` (required)
- `X-Correlation-Id: <uuid>` (optional, generated if not provided)

## User Tiers

The platform supports three membership tiers:

- **Neighbor** (free): Basic access to platform features
- **Supporter**: Enhanced features for active community members
- **Caretaker**: Premium features for community organizers

Tiers are managed via Cognito groups: `neighbor-tier`, `supporter-tier`, `caretaker-tier`.

## Development Workflow

### Backend Development

```bash
cd backend

# Run tests
cargo test

# Lint code
cargo clippy

# Format code
cargo fmt

# Build for Lambda
cargo lambda build --release --arm64

# Deploy
sam deploy
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev

# Lint code
npm run lint

# Build for production
npm run build
```

## Testing

### Backend Tests

```bash
cd backend
cargo test
```

Tests include:
- Unit tests for handlers, middleware, and models
- Integration tests for API endpoints
- Authorizer tier mapping tests

### Frontend Testing

Phase 0 focuses on manual testing:
- Sign-in flow
- Profile display
- Responsive design
- PWA installation
- Error handling

## Observability

### Structured Logging

All Lambda functions emit JSON-formatted logs with:
- `timestamp`: ISO 8601 timestamp
- `level`: Log level (error, warn, info, debug)
- `correlationId`: Request correlation ID
- `message`: Log message
- Additional context fields

### Correlation IDs

Every request includes a correlation ID that flows through:
1. Frontend generates UUID (or accepts from client)
2. API Gateway passes to Lambda Authorizer
3. Authorizer includes in logs
4. API Lambda extracts and includes in all logs
5. API Lambda returns in response header

This enables end-to-end request tracing across all components.

### CloudWatch Logs

View logs in AWS Console or via CLI:

```bash
# API Lambda logs
aws logs tail /aws/lambda/<stack-name>-ApiFunction --follow

# Authorizer logs
aws logs tail /aws/lambda/<stack-name>-LambdaAuthorizerFunction --follow
```

## Security

- **Authentication**: Cognito JWT tokens with signature validation
- **Authorization**: Lambda authorizer validates tokens before API access
- **Encryption**: Data encrypted at rest (DynamoDB, S3) and in transit (HTTPS)
- **CORS**: Configured to allow only frontend domain
- **Security Headers**: Strict-Transport-Security, X-Content-Type-Options, etc.
- **Least Privilege**: IAM roles grant minimal required permissions

## Contributing

This is currently a private project. Contribution guidelines will be added in future phases.

## License

[To be determined]

## Support

For issues or questions:
- Check [Local Development Guide](./docs/phase-0-local-dev.md) for common issues
- Review CloudWatch Logs for detailed error messages
- Consult [Deployment Guide](./docs/phase-0-deployment.md) for deployment issues

## Roadmap

See [Roadmap](./.kiro/steering/roadmap.md) for the complete multi-phase development plan.

**Next Phase**: Phase 1 - Grower-first MVP
- Grower profiles
- Listing creation and management
- Basic discovery view
- Event emission on writes

---

Built with ❤️ for community food coordination
