"""One-off: creates a single placeholder user in Supabase Auth so we have a
valid user_id to attach meals to before real login (Phase 2) exists.

Uses a fake @example.com address on purpose — example.com is reserved for
documentation/testing and never delivers mail, so this can't spam anyone.
This is a temporary stand-in, not real auth — swap it out once Phase 2 wires
actual Supabase Auth login in the frontend.

Run from backend/: .venv\\Scripts\\python.exe scripts\\create_test_user.py
"""

import sys
import uuid

sys.path.insert(0, ".")

from app.db import get_supabase  # noqa: E402

TEST_EMAIL = "dev-test-user@example.com"
TEST_PASSWORD = str(uuid.uuid4())  # random, unused — we only need the user's id


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
            # Already created by a previous run — look it up instead.
            users = client.auth.admin.list_users()
            match = next((u for u in users if u.email == TEST_EMAIL), None)
            if not match:
                raise RuntimeError(f"User exists but couldn't be found via list_users(): {e}") from e
            user_id = match.id
            print(f"Test user already existed: {TEST_EMAIL}")
        else:
            raise

    print(f"\nAdd this to backend/.env:\nTEST_USER_ID={user_id}")


if __name__ == "__main__":
    main()
