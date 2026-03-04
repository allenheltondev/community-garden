import json
import os
import secrets
import string
from typing import Dict

import boto3
from botocore.exceptions import ClientError

USER_POOL_ID = os.environ["USER_POOL_ID"]
USER_POOL_CLIENT_ID = os.environ["USER_POOL_CLIENT_ID"]
cognito = boto3.client("cognito-idp")


def _random_suffix() -> str:
    return secrets.token_hex(4)


def _strong_password() -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return (
        secrets.choice(string.ascii_uppercase)
        + secrets.choice(string.ascii_lowercase)
        + secrets.choice(string.digits)
        + secrets.choice("!@#$%^&*")
        + "".join(secrets.choice(alphabet) for _ in range(16))
    )


def _create_and_sign_in_user(user_label: str) -> Dict[str, str]:
    for _ in range(5):
        suffix = _random_suffix()
        email = f"ci+{user_label}-{suffix}@example.com"
        password = _strong_password()

        try:
            cognito.admin_create_user(
                UserPoolId=USER_POOL_ID,
                Username=email,
                MessageAction="SUPPRESS",
                UserAttributes=[
                    {"Name": "email", "Value": email},
                    {"Name": "email_verified", "Value": "true"},
                ],
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "UsernameExistsException":
                continue
            raise

        cognito.admin_set_user_password(
            UserPoolId=USER_POOL_ID,
            Username=email,
            Password=password,
            Permanent=True,
        )

        auth_response = cognito.admin_initiate_auth(
            UserPoolId=USER_POOL_ID,
            ClientId=USER_POOL_CLIENT_ID,
            AuthFlow="ADMIN_USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": password},
        )

        tokens = auth_response["AuthenticationResult"]
        return {
            "email": email,
            "access_token": tokens["AccessToken"],
            "id_token": tokens["IdToken"],
            "refresh_token": tokens["RefreshToken"],
        }

    raise RuntimeError(f"Failed to create a unique Cognito user for label '{user_label}'")


def handler(_event, _context):
    grower = _create_and_sign_in_user("grower")
    gatherer = _create_and_sign_in_user("gatherer")

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"grower": grower, "gatherer": gatherer}),
    }
