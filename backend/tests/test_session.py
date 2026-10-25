from datetime import datetime, timedelta

from models import LoginUser
from utils.database import get_connection
from utils.session import session_manager


def _activity(token):
    with get_connection() as conn:
        return conn.execute(
            "SELECT last_activity_at FROM user_sessions WHERE token = ?", (token,)
        ).fetchone()[0]


def _set_activity(token, when):
    with get_connection() as conn:
        conn.execute("UPDATE user_sessions SET last_activity_at = ? WHERE token = ?", (when.isoformat(), token))
        conn.commit()


def test_last_activity_updates_are_throttled(client, user_a):
    user, _ = user_a
    token = session_manager.create_session(LoginUser(username=user.email, displayName=user.email, roles=[]), user.id)

    recent = datetime.utcnow() - timedelta(minutes=1)
    _set_activity(token, recent)
    assert session_manager.get_user(token).username == user.email
    assert _activity(token) == recent.isoformat()  # untouched

    stale = datetime.utcnow() - timedelta(minutes=10)
    _set_activity(token, stale)
    assert session_manager.get_user(token) is not None
    assert datetime.fromisoformat(_activity(token)) > stale + timedelta(minutes=9)
