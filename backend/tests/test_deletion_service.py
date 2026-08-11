from types import SimpleNamespace

from services import deletion_service


class StorageBucket:
    def __init__(self, removed, fail=False):
        self.removed = removed
        self.fail = fail

    def remove(self, paths):
        if self.fail:
            raise RuntimeError("storage unavailable")
        self.removed.extend(paths)


class Storage:
    def __init__(self, removed, fail=False):
        self.removed = removed
        self.fail = fail
        self.bucket = None

    def from_(self, bucket):
        self.bucket = bucket
        return StorageBucket(self.removed, self.fail)


class Admin:
    def __init__(self):
        self.deleted = []

    def delete_user(self, uid):
        self.deleted.append(uid)


def install_extras(sb, storage_fail=False):
    sb.storage = Storage([], storage_fail)
    sb.auth = SimpleNamespace(admin=Admin())


def test_complete_erasure_covers_schema_storage_auth_and_shared_resources(monkeypatch, fake_supabase):
    install_extras(fake_supabase)
    fake_supabase.preload("files", [{"storage_path": "u/file.pdf"}])
    fake_supabase.preload("code_snapshots", [{"storage_path": "u/code.zip"}])
    fake_supabase.preload("viva_sessions", [{"id": "v1"}])
    fake_supabase.preload("projects", [
        {"id": "private", "team_id": None},
        {"id": "shared", "team_id": "team-1"},
    ])
    monkeypatch.setattr(deletion_service, "get_supabase", lambda: fake_supabase)
    monkeypatch.setattr(
        deletion_service, "get_settings", lambda: SimpleNamespace(storage_bucket="configured-bucket")
    )

    result = deletion_service.execute_deletion("u1")

    assert result["status"] == "completed"
    assert fake_supabase.storage.bucket == "configured-bucket"
    assert fake_supabase.storage.removed == ["u/code.zip", "u/file.pdf"]
    assert fake_supabase.auth.admin.deleted == ["u1"]
    assert {"faculty_sim_ratings", "achievements", "readiness_snapshots", "institution_members"} <= set(result["deleted_tables"])
    assert {"owner_id": None} in fake_supabase.table("projects").updates
    assert {"assignee_id": None} in fake_supabase.table("tasks").updates
    assert {"admin_profile_id": None} in fake_supabase.table("institutions").updates


def test_partial_storage_failure_is_persisted_and_never_claims_completion(monkeypatch, fake_supabase):
    install_extras(fake_supabase, storage_fail=True)
    fake_supabase.preload("files", [{"storage_path": "u/file.pdf"}])
    monkeypatch.setattr(deletion_service, "get_supabase", lambda: fake_supabase)
    monkeypatch.setattr(
        deletion_service, "get_settings", lambda: SimpleNamespace(storage_bucket="private-uploads")
    )

    result = deletion_service.execute_deletion("u1")

    assert result["status"] == "failed"
    assert result["failures"][0]["step"] == "storage_objects"
    assert fake_supabase.auth.admin.deleted == []
    updates = fake_supabase.table("data_deletion_requests").updates
    assert any(u.get("status") == "failed" and u.get("failure_detail") for u in updates)


def test_retry_operations_are_idempotent_when_no_rows_remain(monkeypatch, fake_supabase):
    install_extras(fake_supabase)
    monkeypatch.setattr(deletion_service, "get_supabase", lambda: fake_supabase)
    monkeypatch.setattr(
        deletion_service, "get_settings", lambda: SimpleNamespace(storage_bucket="uploads")
    )

    assert deletion_service.execute_deletion("u1")["status"] == "completed"
