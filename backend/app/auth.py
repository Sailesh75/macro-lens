"""Real auth: every request must carry a valid Supabase session token in
`Authorization: Bearer <token>`. We verify it against Supabase's Auth API
(via the SDK's auth.get_user) and use the resulting user id — never a
client-supplied one — for every query. Replaces the old hardcoded
TEST_USER_ID stand-in (see git history / learning.md for that era).
"""

from fastapi import Header, HTTPException

from app.db import get_supabase


def get_current_user_id(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        response = get_supabase().auth.get_user(token)
    except Exception as e:
        raise HTTPException(401, "Invalid or expired session") from e

    if not response or not response.user:
        raise HTTPException(401, "Invalid or expired session")

    return response.user.id
