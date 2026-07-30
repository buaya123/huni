import os
import random

import resend
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY")

EMAIL_FROM = os.getenv(
    "EMAIL_FROM",
    "Huni <onboarding@resend.dev>",
)


def generate_verification_code() -> str:
    """
    Generate a random 6-digit verification code.
    """
    return f"{random.randint(100000, 999999)}"


def send_verification_email(
    email: str,
    code: str,
):
    """
    Send an email verification code using Resend.
    """

    resend.Emails.send(
        {
            "from": EMAIL_FROM,
            "to": [email],
            "subject": "Verify your Huni account",
            "html": f"""
            <div style="font-family:Arial,sans-serif">
                <h2>Welcome to Huni!</h2>

                <p>
                    Thank you for registering.
                </p>

                <p>
                    Use the verification code below:
                </p>

                <h1 style="letter-spacing:5px;">
                    {code}
                </h1>

                <p>
                    This code expires in
                    <strong>15 minutes</strong>.
                </p>

                <p>
                    If you didn't create a Huni account,
                    you can safely ignore this email.
                </p>

                <hr>

                <small>
                    Huni Technologies
                </small>
            </div>
            """,
        }
    )