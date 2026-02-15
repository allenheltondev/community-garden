#!/usr/bin/env python3
"""
Cross-platform deployment script for Community Garden App.
Deploys the backend SAM stack and configures frontend environment variables.

Usage:
    python deploy-and-configure.py [--profile PROFILE] [--region REGION] [--stack-name STACK_NAME]
"""

import argparse
import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from typing import Dict, Optional


class Colors:
    """ANSI color codes for terminal output."""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

    @classmethod
    def disable(cls):
        """Disable colors for Windows cmd or when piping."""
        cls.HEADER = ''
        cls.OKBLUE = ''
        cls.OKCYAN = ''
        cls.OKGREEN = ''
        cls.WARNING = ''
        cls.FAIL = ''
        cls.ENDC = ''
        cls.BOLD = ''


def print_step(message: str):
    """Print a step message."""
    print(f"\n{Colors.OKBLUE}> {message}{Colors.ENDC}")


def print_success(message: str):
    """Print a success message."""
    print(f"{Colors.OKGREEN}+ {message}{Colors.ENDC}")


def print_error(message: str):
    """Print an error message."""
    print(f"{Colors.FAIL}x {message}{Colors.ENDC}", file=sys.stderr)


def print_warning(message: str):
    """Print a warning message."""
    print(f"{Colors.WARNING}! {message}{Colors.ENDC}")


def run_command(cmd: list, cwd: Optional[Path] = None, env: Optional[Dict] = None) -> tuple:
    """Run a command and return (success, stdout, stderr)."""
    try:
        # On Windows, we need shell=True for commands to work properly
        use_shell = platform.system() == 'Windows'

        result = subprocess.run(
            cmd,
            cwd=cwd,
            env=env or os.environ.copy(),
            capture_output=True,
            text=True,
            check=False,
            shell=use_shell
        )
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)


def check_prerequisites() -> bool:
    """Check if required tools are installed."""
    print_step("Checking prerequisites...")

    required_tools = {
        'sam': ['sam', '--version'],
        'aws': ['aws', '--version'],
    }

    all_present = True
    for tool, cmd in required_tools.items():
        success, stdout, _ = run_command(cmd)
        if success:
            version = stdout.strip().split('\n')[0]
            print_success(f"{tool}: {version}")
        else:
            print_error(f"{tool} is not installed or not in PATH")
            all_present = False

    return all_present


def build_backend(backend_dir: Path, profile: Optional[str] = None, ci: bool = False) -> bool:
    """Build the SAM application."""
    print_step("Building backend...")

    cmd = ['sam', 'build']
    if ci:
        cmd.append('--debug')

    env = os.environ.copy()
    if profile:
        env['AWS_PROFILE'] = profile

    success, stdout, stderr = run_command(cmd, cwd=backend_dir, env=env)

    if success:
        print_success("Backend built successfully")
        return True
    else:
        print_error("Backend build failed")
        if stdout.strip():
            print(stdout)
        if stderr.strip():
            print(stderr, file=sys.stderr)
        print_error(f"Command: {' '.join(cmd)}")
        return False


def deploy_backend(
    backend_dir: Path,
    profile: Optional[str] = None,
    region: Optional[str] = None,
    stack_name: Optional[str] = None,
    ci: bool = False
) -> bool:
    """Deploy the SAM application."""
    print_step("Deploying backend...")

    cmd = ['sam', 'deploy', '--resolve-s3', '--capabilities', 'CAPABILITY_IAM']

    if profile:
        cmd.extend(['--profile', profile])
    if region:
        cmd.extend(['--region', region])
    if stack_name:
        cmd.extend(['--stack-name', stack_name])
    if ci:
        cmd.extend(['--no-confirm-changeset', '--no-fail-on-empty-changeset'])

    env = os.environ.copy()
    if profile:
        env['AWS_PROFILE'] = profile

    success, stdout, stderr = run_command(cmd, cwd=backend_dir, env=env)

    if success:
        print_success("Backend deployed successfully")
        return True
    else:
        print_error("Backend deployment failed")
        if stdout.strip():
            print(stdout)
        if stderr.strip():
            print(stderr, file=sys.stderr)
        print_error(f"Command: {' '.join(cmd)}")
        return False


def get_stack_outputs(stack_name: str, profile: Optional[str] = None, region: Optional[str] = None) -> Optional[Dict[str, str]]:
    """Retrieve CloudFormation stack outputs."""
    print_step("Retrieving stack outputs...")

    cmd = ['aws', 'cloudformation', 'describe-stacks', '--stack-name', stack_name, '--query', 'Stacks[0].Outputs', '--output', 'json']

    if profile:
        cmd.extend(['--profile', profile])
    if region:
        cmd.extend(['--region', region])

    env = os.environ.copy()
    if profile:
        env['AWS_PROFILE'] = profile

    success, stdout, stderr = run_command(cmd, env=env)

    if not success:
        print_error("Failed to retrieve stack outputs")
        print(stderr)
        return None

    try:
        outputs = json.loads(stdout)
        output_dict = {item['OutputKey']: item['OutputValue'] for item in outputs}
        print_success(f"Retrieved {len(output_dict)} outputs")
        return output_dict
    except (json.JSONDecodeError, KeyError) as e:
        print_error(f"Failed to parse stack outputs: {e}")
        return None


def create_env_file(frontend_dir: Path, outputs: Dict[str, str], region: str) -> bool:
    """Create the frontend .env file from stack outputs."""
    print_step("Creating frontend .env file...")

    env_file = frontend_dir / '.env'

    env_content = f"""# AWS Amplify Configuration
# Auto-generated by deploy-and-configure.py

# Cognito User Pool ID
VITE_USER_POOL_ID={outputs.get('UserPoolId', '')}

# Cognito User Pool Client ID
VITE_USER_POOL_CLIENT_ID={outputs.get('UserPoolClientId', '')}

# Cognito Hosted UI Domain
VITE_USER_POOL_DOMAIN={outputs.get('UserPoolDomain', '')}

# API Gateway Endpoint URL
VITE_API_URL={outputs.get('ApiUrl', '')}

# Frontend URL (using localhost for local development)
VITE_FRONTEND_URL=http://localhost:5173

# AWS Region
VITE_AWS_REGION={region}
"""

    try:
        env_file.write_text(env_content, encoding='utf-8')
        print_success(f"Created {env_file}")

        print(f"\n{Colors.OKCYAN}Environment variables configured:{Colors.ENDC}")
        for line in env_content.split('\n'):
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                print(f"  {key}: {value}")

        return True
    except Exception as e:
        print_error(f"Failed to create .env file: {e}")
        return False


def main():
    """Main execution function."""
    # Ensure SAM does not prompt in non-interactive environments (e.g., CI runners).
    os.environ.setdefault('SAM_CLI_TELEMETRY', '0')
    # Avoid AWS CLI paging behavior in CI logs.
    os.environ.setdefault('AWS_PAGER', '')

    parser = argparse.ArgumentParser(description='Deploy backend and configure frontend environment')
    parser.add_argument('--profile', help='AWS profile to use (default: AWS SDK/CLI default chain)')
    parser.add_argument('--region', default='us-east-1', help='AWS region (default: us-east-1)')
    parser.add_argument('--stack-name', default='community-garden', help='CloudFormation stack name (default: community-garden)')
    parser.add_argument('--skip-build', action='store_true', help='Skip the build step (use existing build)')
    parser.add_argument('--skip-deploy', action='store_true', help='Skip deployment (only update .env from existing stack)')
    parser.add_argument('--config-only', action='store_true', help='Only update frontend .env from existing stack (same as --skip-build --skip-deploy)')
    parser.add_argument('--no-color', action='store_true', help='Disable colored output')
    parser.add_argument('--ci', action='store_true', help='CI mode: skip frontend .env creation (outputs are passed via environment)')

    args = parser.parse_args()

    # --config-only is a shorthand for --skip-build --skip-deploy
    if args.config_only:
        args.skip_build = True
        args.skip_deploy = True

    if args.no_color or (platform.system() == 'Windows' and os.environ.get('TERM') != 'xterm'):
        Colors.disable()

    script_dir = Path(__file__).parent.resolve()
    backend_dir = script_dir / 'backend'
    frontend_dir = script_dir / 'frontend'

    if not backend_dir.exists():
        print_error(f"Backend directory not found: {backend_dir}")
        return 1

    if not frontend_dir.exists():
        print_error(f"Frontend directory not found: {frontend_dir}")
        return 1

    print(f"{Colors.HEADER}{Colors.BOLD}")
    print("=" * 60)
    print("  Community Garden App - Deploy & Configure")
    print("=" * 60)
    print(f"{Colors.ENDC}")
    print(f"Backend:  {backend_dir}")
    print(f"Frontend: {frontend_dir}")
    print(f"Profile:  {args.profile or '(default)'}")
    print(f"Region:   {args.region}")
    print(f"Stack:    {args.stack_name}")

    if not check_prerequisites():
        print_error("Missing required tools. Please install them and try again.")
        return 1

    # Treat GitHub Actions and other CI environments as CI mode automatically.
    ci_mode = args.ci or os.environ.get('CI', '').lower() in ('1', 'true', 'yes')

    if not args.skip_build and not args.skip_deploy:
        if not build_backend(backend_dir, args.profile, ci_mode):
            return 1

    if not args.skip_deploy:
        if not deploy_backend(backend_dir, args.profile, args.region, args.stack_name, ci_mode):
            return 1

    outputs = get_stack_outputs(args.stack_name, args.profile, args.region)
    if not outputs:
        return 1

    if not ci_mode:
        if not create_env_file(frontend_dir, outputs, args.region):
            return 1

        print(f"\n{Colors.OKGREEN}{Colors.BOLD}+ Deployment and configuration complete!{Colors.ENDC}")
        print(f"\n{Colors.OKCYAN}Next steps:{Colors.ENDC}")
        print(f"  1. cd frontend")
        print(f"  2. npm install (if not already done)")
        print(f"  3. npm run dev")
        print(f"\n{Colors.OKCYAN}Frontend will be available at:{Colors.ENDC} http://localhost:5173")
    else:
        # In CI mode, output the values for GitHub Actions to capture
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}+ Deployment complete!{Colors.ENDC}")
        print(f"\n{Colors.OKCYAN}Stack outputs:{Colors.ENDC}")
        for key, value in outputs.items():
            print(f"{key}={value}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
