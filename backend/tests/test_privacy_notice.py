"""The privacy notice has to be accurate, itemised, and versioned.

Two classes of problem in version 1.0. It was not shaped for Rule 3 of the DPDP
Rules 2025, which requires an itemised notice rather than prose. And it asserted
three things the codebase does not do — automatic 7-day deletion of uploads,
hosting in India with end-to-end encryption, and no third-party sharing — while
every session's audio, transcript and code summary goes to Google's Gemini API.
An unsupported claim in a privacy notice is worse than a vague one.
"""
from __future__ import annotations

import pytest

from api.privacy import GRIEVANCE_OFFICER, POLICY_VERSION, PRIVACY_POLICY, consent_status, get_policy


def _all_text() -> str:
    parts = [PRIVACY_POLICY.get("summary", "")]
    parts += [s["body"] for s in PRIVACY_POLICY["sections"]]
    parts += [s["heading"] for s in PRIVACY_POLICY["sections"]]
    for item in PRIVACY_POLICY["items"]:
        parts += [item["data"], item["purpose"], item["enables"]]
    return " ".join(parts).lower()


# --------------------------------------------------------------------------- #
# Rule 3 shape: itemised data, purpose, and what it enables
# --------------------------------------------------------------------------- #
def test_the_notice_itemises_the_data_it_collects():
    assert len(PRIVACY_POLICY["items"]) >= 5


@pytest.mark.parametrize("field", ["data", "purpose", "enables"])
def test_every_item_names_its_purpose_and_what_it_enables(field: str):
    for item in PRIVACY_POLICY["items"]:
        assert item.get(field), f"{item} is missing {field}"


def test_the_processing_a_student_would_be_surprised_by_is_itemised():
    text = _all_text()
    for expected in ("transcript", "audio", "code", "camera"):
        assert expected in text, f"the notice never mentions {expected}"


def test_the_notice_names_the_law_it_is_given_under():
    assert "2023" in PRIVACY_POLICY["law"]
    assert "2025" in PRIVACY_POLICY["law"], "the DPDP Rules 2025 operationalise the Act"


def test_the_notice_states_how_to_withdraw_and_how_to_complain():
    text = _all_text()
    assert "withdraw" in text
    assert "data protection board" in text, "Rule 3 requires a route to the Board"


def test_a_route_past_us_to_the_board_is_stated_without_needing_permission():
    assert "do not need our permission" in GRIEVANCE_OFFICER["escalation"].lower()


def test_the_grievance_promise_acknowledges_the_statutory_limit():
    """Promising 7 working days is fine; pretending 7 days is the legal limit is
    not, and the Rules set 90."""
    assert "90" in GRIEVANCE_OFFICER["response_time"]


def test_children_are_covered():
    text = _all_text()
    assert "18" in text
    assert "guardian" in text
    assert "advertising" in text, "the Act forbids targeted advertising to children"


def test_the_breach_window_is_stated():
    assert "72 hours" in _all_text()


# --------------------------------------------------------------------------- #
# Accuracy: nothing the code cannot back
# --------------------------------------------------------------------------- #
def test_the_third_party_processors_are_named():
    """Concealing the AI processor while claiming nothing is shared is the
    opposite of informed consent — and it is the core of how the product works."""
    text = _all_text()
    assert "gemini" in text or "google" in text
    assert "supabase" in text


def test_the_unbacked_seven_day_deletion_claim_is_gone():
    """No job deletes code_snapshots. Grep the repo before restoring this."""
    text = _all_text()
    # The old false claim was that uploaded code is automatically deleted within 7 days.
    # A truthful mention of '7 days' for cookie expiry is fine — check the specific
    # false claim rather than a blanket string match.
    assert "deleted within 7 days" not in text
    assert "deleted after 7 days" not in text


def test_no_unverifiable_hosting_or_encryption_claims():
    text = _all_text()
    assert "aws mumbai" not in text
    assert "aes-256" not in text
    assert "end-to-end" not in text or "not claim end-to-end" in text


def test_the_no_sharing_claim_is_scoped_to_what_is_true():
    """We do not sell or advertise. We do share with processors, necessarily."""
    text = _all_text()
    assert "do not sell" in text
    assert "cross-border" in text or "outside india" in text


def test_the_training_promise_is_explicit():
    text = _all_text()
    assert "train" in text
    assert "new consent" in text, "a new purpose needs new consent, not a quiet update"


# --------------------------------------------------------------------------- #
# Versioning
# --------------------------------------------------------------------------- #
def test_the_version_was_bumped_past_the_inaccurate_notice():
    assert POLICY_VERSION != "1.0"


def test_a_stale_consent_triggers_reconsent():
    """Consent recorded against a different description of the processing is not
    consent to this one."""
    stale = {"profile": {"consent_accepted_at": "2026-01-01T00:00:00Z", "consent_version": "1.0"}}
    assert consent_status(user=stale)["needs_reconsent"] is True


def test_a_current_consent_does_not_ask_again():
    current = {
        "profile": {"consent_accepted_at": "2026-07-29T00:00:00Z", "consent_version": POLICY_VERSION}
    }
    status = consent_status(user=current)
    assert status["consent_accepted"] is True
    assert status["needs_reconsent"] is False


def test_no_consent_at_all_needs_consent():
    status = consent_status(user={"profile": {}})
    assert status["consent_accepted"] is False
    assert status["needs_reconsent"] is True


# --------------------------------------------------------------------------- #
# One source of truth
# --------------------------------------------------------------------------- #
def test_the_endpoint_serves_the_officer_with_the_notice():
    """The page renders whatever this returns, so the contact has to travel with
    it — the page used to hardcode its own copy of both."""
    served = get_policy()
    assert served["grievance_officer"]["email"]
    assert served["version"] == POLICY_VERSION
    assert served["items"]
