from email_service import (
    generate_verification_code,
    send_verification_email,
)

code = generate_verification_code()

print(code)

send_verification_email(
    "josephjunejoee@gmail.com",
    code,
)

print("Done!")