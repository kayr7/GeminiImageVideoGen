from utils.quota_manager import QuotaManager


def test_missing_quota_row_gets_default(make_user):
    user, _ = make_user()
    assert QuotaManager.get_quota(user.id, "text") is None

    assert QuotaManager.check_quota(user.id, "text") == (True, None)
    quota = QuotaManager.get_quota(user.id, "text")
    assert quota.quota_limit == QuotaManager.DEFAULT_QUOTAS["text"]["limit"]
    assert quota.quota_used == 0


def test_explicit_zero_quota_still_denies(make_user):
    user, _ = make_user(quotas={"text": ("limited", 0)})
    ok, message = QuotaManager.check_quota(user.id, "text")
    assert not ok and "set to 0" in message
