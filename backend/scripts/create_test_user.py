"""Creates (or resets the password on) a throwaway test account with a KNOWN
password, for logging in directly via Supabase's auth API — e.g. from a
Postman "Login" request — instead of copying a token out of the browser
every time it expires.

Uses a fake @example.com address on purpose — example.com is reserved for
documentation/testing and never delivers mail, so this can't spam anyone.
A fixed, known password is fine here specifically because this is a
throwaway test identity, not a real person's account.

Run from backend/: .venv\\Scripts\\python.exe scripts\\create_test_user.py
"""

import sys

sys.path.insert(0, ".")

from app.db import get_supabase  # noqa: E402

TEST_EMAIL = "dev-test-user@example.com"
TEST_PASSWORD = "TestPassword123!"


def main():
    client = get_supabase()
    try:
        result = client.auth.admin.create_user(
            {"email": TEST_EMAIL, "password": TEST_PASSWORD, "email_confirm": True}
        )
        user_id = result.user.id
        print(f"Created test user: {TEST_EMAIL}")
    except Exception as e:
        if "already been registered" in str(e) or "already exists" in str(e).lower():
            # Already exists (e.g. from the old TEST_USER_ID era) — look it up
            # and force its password to our known value instead of leaving
            # whatever random one it had before.
            users = client.auth.admin.list_users()
            match = next((u for u in users if u.email == TEST_EMAIL), None)
            if not match:
                raise RuntimeError(f"User exists but couldn't be found via list_users(): {e}") from e
            user_id = match.id
            client.auth.admin.update_user_by_id(user_id, {"password": TEST_PASSWORD})
            print(f"Test user already existed: {TEST_EMAIL} — password reset to the known value below")
        else:
            raise

    print(f"\nUse these in Postman's Login request body:\nemail: {TEST_EMAIL}\npassword: {TEST_PASSWORD}")


if __name__ == "__main__":
    main()
