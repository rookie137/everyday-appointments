"""Everyday Appointments — backend API regression suite.

Covers: public endpoints, slot engine (weekday/sunday/holiday), patient OTP+booking,
clinic OTP+ledger+walk-in+emergency-cancel+settings, super admin CRUD, authorization.
"""
import os
import random
from datetime import datetime, timedelta, date as ddate

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = dotenv_values("/app/backend/.env").get("SUPER_ADMIN_EMAIL", "admin@everyday-appointments.app")
ADMIN_PASSWORD = "admin1234"
DEMO_CLINIC_EMAIL = "demo@clinic.example.com"

SUNDAY = "2026-08-16"      # Sunday
HOLIDAY = "2026-08-15"     # Independence Day (also Saturday, holiday check is after working-day check)
REPUBLIC = "2026-01-26"


def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


def next_weekday(offset_days=30):
    d = ddate.today() + timedelta(days=offset_days)
    while d.weekday() == 6 or d.strftime("%Y-%m-%d") in HOLIDAY_DATES:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


HOLIDAY_DATES = {d for d, _ in [
    ("2026-01-01", 1), ("2026-01-14", 1), ("2026-01-26", 1), ("2026-03-04", 1),
    ("2026-03-20", 1), ("2026-04-14", 1), ("2026-04-15", 1), ("2026-05-27", 1),
    ("2026-08-15", 1), ("2026-08-26", 1), ("2026-10-02", 1), ("2026-10-20", 1),
    ("2026-12-25", 1)]}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def client():
    return s()


@pytest.fixture(scope="session")
def clinic_id(client):
    r = client.get(f"{API}/clinics")
    assert r.status_code == 200, r.text
    clinics = r.json()
    assert clinics, "No clinics seeded"
    demo = next((c for c in clinics if c["name"] == "Kannur Family Clinic"), clinics[0])
    return demo["id"]


@pytest.fixture(scope="session")
def admin_token(client):
    """Admin token via real admin login (no fallback)."""
    r = client.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def clinic_token(client):
    r = client.post(f"{API}/auth/clinic/request-otp", json={"email": DEMO_CLINIC_EMAIL})
    assert r.status_code == 200, r.text
    otp = r.json().get("demo_otp")
    assert otp, "no demo_otp returned"
    v = client.post(f"{API}/auth/clinic/verify-otp", json={"email": DEMO_CLINIC_EMAIL, "code": otp})
    assert v.status_code == 200, v.text
    return v.json()["token"]


def make_patient(client, phone, name, place="Kannur"):
    r = client.post(f"{API}/auth/patient/request-otp", json={"phone": phone})
    assert r.status_code == 200, r.text
    otp = r.json()["demo_otp"]
    v = client.post(f"{API}/auth/patient/verify-otp",
                    json={"phone": phone, "code": otp, "name": name, "place": place})
    assert v.status_code == 200, v.text
    return v.json()


@pytest.fixture(scope="session")
def patient_a(client):
    return make_patient(client, "+919999900001", "Test Patient")


@pytest.fixture(scope="session")
def patient_b(client):
    return make_patient(client, "+919999900002", "TEST_Patient B")


def auth(token):
    ses = s()
    ses.headers.update({"Authorization": f"Bearer {token}"})
    return ses


# ---------- module: public ----------
class TestPublic:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json() == {"app": "Everyday Appointments", "ok": True}

    def test_clinics_list(self, client):
        r = client.get(f"{API}/clinics")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        names = [c["name"] for c in data]
        assert "Kannur Family Clinic" in names
        for c in data:
            assert "_id" not in c
            assert set(["id", "name", "doctor_name", "place", "whatsapp_number"]).issubset(c)

    def test_clinic_detail_and_bad_id(self, client, clinic_id):
        r = client.get(f"{API}/clinics/{clinic_id}")
        assert r.status_code == 200
        assert r.json()["id"] == clinic_id
        assert client.get(f"{API}/clinics/not-an-objectid").status_code == 400
        assert client.get(f"{API}/clinics/64b7f3a2c9d1e2f3a4b5c6d7").status_code == 404

    def test_slots_weekday_open(self, client, clinic_id):
        d = next_weekday()
        r = client.get(f"{API}/clinics/{clinic_id}/slots", params={"date": d})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "open", data
        assert len(data["slots"]) > 0
        first = data["slots"][0]
        assert first["time"] == "09:00" and first["token"] == 1
        # lunch break 13:00-14:00 excluded for demo clinic
        times = [x["time"] for x in data["slots"]]
        assert "13:00" not in times and "13:45" not in times

    def test_slots_sunday_closed(self, client, clinic_id):
        r = client.get(f"{API}/clinics/{clinic_id}/slots", params={"date": SUNDAY})
        assert r.status_code == 200
        assert r.json()["status"] == "closed"

    def test_slots_holiday(self, client, clinic_id):
        r = client.get(f"{API}/clinics/{clinic_id}/slots", params={"date": HOLIDAY})
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "holiday", body
        assert body.get("holiday_name")

    def test_slots_bad_date(self, client, clinic_id):
        r = client.get(f"{API}/clinics/{clinic_id}/slots", params={"date": "2026-13-99"})
        assert r.status_code == 400

    def test_public_holidays(self, client):
        r = client.get(f"{API}/holidays")
        assert r.status_code == 200
        assert len(r.json()) >= 13


# ---------- module: patient auth ----------
class TestPatientAuth:
    def test_request_otp_returns_demo_otp(self, client):
        r = client.post(f"{API}/auth/patient/request-otp", json={"phone": "+919999900010"})
        assert r.status_code == 200
        assert len(r.json()["demo_otp"]) == 6

    def test_invalid_phone(self, client):
        r = client.post(f"{API}/auth/patient/request-otp", json={"phone": "123"})
        assert r.status_code == 400

    def test_wrong_otp(self, client):
        phone = "+919999900011"
        client.post(f"{API}/auth/patient/request-otp", json={"phone": phone})
        r = client.post(f"{API}/auth/patient/verify-otp", json={"phone": phone, "code": "000000", "name": "X"})
        assert r.status_code == 400

    def test_missing_name_new_patient(self, client):
        phone = f"+9199888{random.randint(10000, 99999)}"
        otp = client.post(f"{API}/auth/patient/request-otp", json={"phone": phone}).json()["demo_otp"]
        r = client.post(f"{API}/auth/patient/verify-otp", json={"phone": phone, "code": otp})
        assert r.status_code == 400, r.text

    def test_verify_creates_patient(self, client, patient_a):
        assert patient_a["token"]
        p = patient_a["patient"]
        assert p["name"] == "Test Patient"
        assert p["phone_number"] == "+919999900001"
        assert "_id" not in p

    def test_otp_single_use(self, client):
        phone = "+919999900012"
        otp = client.post(f"{API}/auth/patient/request-otp", json={"phone": phone}).json()["demo_otp"]
        assert client.post(f"{API}/auth/patient/verify-otp", json={"phone": phone, "code": otp, "name": "TEST_ru"}).status_code == 200
        again = client.post(f"{API}/auth/patient/verify-otp", json={"phone": phone, "code": otp, "name": "TEST_ru"})
        assert again.status_code == 400, "OTP should not be reusable"

    def test_auth_me_patient(self, patient_a):
        c = auth(patient_a["token"])
        r = c.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "patient"

    # --- feature: returning-patient reuse (request-otp shape) ---
    def test_request_otp_new_phone_not_returning(self, client):
        phone = f"+9198777{random.randint(10000, 99999)}"
        r = client.post(f"{API}/auth/patient/request-otp", json={"phone": phone})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_returning"] is False
        assert d["known_name"] is None
        assert d["known_place"] is None
        assert d["phone"] == phone

    def test_request_otp_returning_phone_returns_known_fields(self, client, patient_a):
        r = client.post(f"{API}/auth/patient/request-otp", json={"phone": "+919999900001"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_returning"] is True
        assert d["known_name"] == "Test Patient"
        assert isinstance(d["known_place"], str)
        assert len(d["demo_otp"]) == 6

    def test_verify_returning_patient_without_name(self, client, patient_a):
        phone = "+919999900001"
        otp = client.post(f"{API}/auth/patient/request-otp", json={"phone": phone}).json()["demo_otp"]
        r = client.post(f"{API}/auth/patient/verify-otp", json={"phone": phone, "code": otp})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["token"]
        assert d["patient"]["phone_number"] == phone
        # existing name preserved, not wiped
        assert d["patient"]["name"] == "Test Patient"
        assert "_id" not in d["patient"]

    def test_returning_flag_flips_after_registration(self, client):
        phone = f"+9198666{random.randint(10000, 99999)}"
        first = client.post(f"{API}/auth/patient/request-otp", json={"phone": phone}).json()
        assert first["is_returning"] is False
        r = client.post(f"{API}/auth/patient/verify-otp", json={"phone": phone, "code": first["demo_otp"], "name": "TEST_Returning", "place": "Thalassery"})
        assert r.status_code == 200, r.text
        second = client.post(f"{API}/auth/patient/request-otp", json={"phone": phone}).json()
        assert second["is_returning"] is True
        assert second["known_name"] == "TEST_Returning"
        assert second["known_place"] == "Thalassery"
        # verify with no name works now
        v = client.post(f"{API}/auth/patient/verify-otp", json={"phone": phone, "code": second["demo_otp"]})
        assert v.status_code == 200, v.text
        assert v.json()["patient"]["name"] == "TEST_Returning"



# ---------- module: patient booking ----------
class TestPatientBooking:
    def test_book_conflict_cancel_rebook(self, client, clinic_id, patient_a, patient_b):
        date = next_weekday(35)
        pa = auth(patient_a["token"])
        pb = auth(patient_b["token"])
        slots = client.get(f"{API}/clinics/{clinic_id}/slots", params={"date": date}).json()["slots"]
        free = next(x for x in slots if x["available"])
        slot_time = free["time"]

        r = pa.post(f"{API}/patient/book/{clinic_id}", json={"date": date, "slot_time": slot_time})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["slot_time"] == slot_time and b["date"] == date
        assert b["token_number"] == free["token"]
        assert b["clinic"]["whatsapp_number"]
        appt_id = b["id"]

        # duplicate booking by another patient -> 409
        dup = pb.post(f"{API}/patient/book/{clinic_id}", json={"date": date, "slot_time": slot_time})
        assert dup.status_code == 409, dup.text

        # slot now unavailable publicly
        slots2 = client.get(f"{API}/clinics/{clinic_id}/slots", params={"date": date}).json()["slots"]
        assert next(x for x in slots2 if x["time"] == slot_time)["available"] is False

        # list appointments
        lst = pa.get(f"{API}/patient/appointments")
        assert lst.status_code == 200
        mine = next(a for a in lst.json() if a["id"] == appt_id)
        assert mine["status"] == "waiting"
        assert mine["clinic"]["name"]

        # cancel and rebook by patient B
        c = pa.post(f"{API}/patient/appointments/{appt_id}/cancel")
        assert c.status_code == 200 and c.json() == {"ok": True}
        rb = pb.post(f"{API}/patient/book/{clinic_id}", json={"date": date, "slot_time": slot_time})
        assert rb.status_code == 200, f"slot not freed after cancel: {rb.status_code} {rb.text}"
        pb.post(f"{API}/patient/appointments/{rb.json()['id']}/cancel")

    def test_book_on_sunday_rejected(self, clinic_id, patient_a):
        pa = auth(patient_a["token"])
        r = pa.post(f"{API}/patient/book/{clinic_id}", json={"date": SUNDAY, "slot_time": "09:00"})
        assert r.status_code == 400

    def test_book_on_holiday_rejected(self, clinic_id, patient_a):
        pa = auth(patient_a["token"])
        r = pa.post(f"{API}/patient/book/{clinic_id}", json={"date": REPUBLIC, "slot_time": "09:00"})
        assert r.status_code == 400

    def test_book_nonexistent_slot(self, clinic_id, patient_a):
        pa = auth(patient_a["token"])
        r = pa.post(f"{API}/patient/book/{clinic_id}", json={"date": next_weekday(40), "slot_time": "23:30"})
        assert r.status_code == 409

    def test_cancel_others_appointment(self, clinic_id, patient_a, patient_b):
        date = next_weekday(41)
        pa = auth(patient_a["token"])
        pb = auth(patient_b["token"])
        r = pa.post(f"{API}/patient/book/{clinic_id}", json={"date": date, "slot_time": "10:00"})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        x = pb.post(f"{API}/patient/appointments/{aid}/cancel")
        assert x.status_code == 404, "patient B must not cancel patient A booking"
        pa.post(f"{API}/patient/appointments/{aid}/cancel")


# ---------- module: clinic admin ----------
class TestClinicAdmin:
    def test_clinic_me(self, clinic_token):
        c = auth(clinic_token)
        r = c.get(f"{API}/clinic/me")
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == DEMO_CLINIC_EMAIL
        assert "_id" not in d and "password_hash" not in d

    def test_settings_update_persist(self, clinic_token):
        c = auth(clinic_token)
        original = c.get(f"{API}/clinic/me").json()
        payload = {
            "working_days": [0, 1, 2, 3, 4],
            "start_time": "10:00",
            "end_time": "16:00",
            "slot_duration_min": 20,
            "breaks": [{"start": "12:30", "end": "13:00"}],
            "advance_booking_days": 30,
            "whatsapp_number": "+919876543211",
        }
        r = c.patch(f"{API}/clinic/me", json=payload)
        assert r.status_code == 200, r.text
        got = c.get(f"{API}/clinic/me").json()
        for k, v in payload.items():
            assert got[k] == v, f"{k} did not persist: {got.get(k)}"
        # slot grid should reflect new settings
        d = next_weekday(37)
        view = c.get(f"{API}/clinic/appointments", params={"date": d}).json()
        if view["status"] == "open":
            assert view["slots"][0]["time"] == "10:00"
            assert (datetime.strptime(view["slots"][1]["time"], "%H:%M")
                    - datetime.strptime(view["slots"][0]["time"], "%H:%M")).seconds == 1200
        # restore
        restore = {k: original.get(k) for k in payload}
        rr = c.patch(f"{API}/clinic/me", json=restore)
        assert rr.status_code == 200

    def test_invalid_settings_validation(self, clinic_token):
        c = auth(clinic_token)
        assert c.patch(f"{API}/clinic/me", json={"slot_duration_min": 0}).status_code == 422
        assert c.patch(f"{API}/clinic/me", json={"advance_booking_days": 999}).status_code == 422

    def test_ledger_walkin_status_and_emergency_cancel(self, clinic_token):
        c = auth(clinic_token)
        date = next_weekday(44)
        base = c.get(f"{API}/clinic/appointments", params={"date": date}).json()
        assert base["status"] == "open", base
        assert isinstance(base["ledger"], list)
        pre_ledger = len(base["ledger"])

        w = c.post(f"{API}/clinic/walk-in", json={
            "name": "TEST_Walkin", "phone": "+919999900055", "place": "Kannur", "date": date})
        assert w.status_code == 200, w.text
        wd = w.json()
        assert wd["token_number"] >= 1 and wd["slot_time"]
        appt_id = wd["id"]

        after = c.get(f"{API}/clinic/appointments", params={"date": date}).json()
        assert len(after["ledger"]) == pre_ledger + 1
        row = next(x for x in after["ledger"] if x["appointment_id"] == appt_id)
        assert row["patient_name"] == "TEST_Walkin"
        assert row["status"] == "waiting"
        assert all(x.get("appointment_id") for x in after["ledger"]), "ledger must only contain bookings"

        for st in ["in_consultation", "completed", "no_show", "waiting"]:
            u = c.patch(f"{API}/clinic/appointments/{appt_id}/status", json={"status": st})
            assert u.status_code == 200, u.text
            v = c.get(f"{API}/clinic/appointments", params={"date": date}).json()
            assert next(x for x in v["ledger"] if x["appointment_id"] == appt_id)["status"] == st

        bad = c.patch(f"{API}/clinic/appointments/{appt_id}/status", json={"status": "banana"})
        assert bad.status_code == 422

        ec = c.post(f"{API}/clinic/emergency-cancel", json={"date": date})
        assert ec.status_code == 200, ec.text
        ecd = ec.json()
        assert ecd["cancelled"] >= 1
        aff = next(a for a in ecd["affected"] if a["id"] == appt_id)
        assert aff["name"] == "TEST_Walkin" and aff["phone"] == "+919999900055"
        assert aff["slot_time"] and aff["token_number"]
        post = c.get(f"{API}/clinic/appointments", params={"date": date}).json()
        assert not any(x["appointment_id"] == appt_id for x in post["ledger"])

    def test_walkin_on_holiday(self, clinic_token):
        c = auth(clinic_token)
        r = c.post(f"{API}/clinic/walk-in", json={"name": "TEST_H", "phone": "+919999900056", "date": REPUBLIC})
        assert r.status_code == 400

    def test_emergency_cancel_empty_day(self, clinic_token):
        c = auth(clinic_token)
        r = c.post(f"{API}/clinic/emergency-cancel", json={"date": "2026-12-25"})
        assert r.status_code == 200
        assert r.json() == {"cancelled": 0, "affected": []}


# ---------- module: super admin ----------
class TestSuperAdmin:
    created = []

    def test_login_bad_password(self, client):
        r = client.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_login_ok(self, client):
        r = client.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, f"documented super-admin credential rejected: {r.status_code} {r.text[:250]}"
        data = r.json()
        assert isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["admin"]["email"] == ADMIN_EMAIL
        assert data["admin"]["role"] == "admin"

    def test_clinics_crud(self, admin_token):
        c = auth(admin_token)
        r = c.get(f"{API}/admin/clinics")
        assert r.status_code == 200
        before = len(r.json())
        email = f"test_clinic_{random.randint(1000,9999)}@example.com"
        payload = {"name": "TEST_Clinic", "doctor_name": "Dr TEST", "email": email,
                   "place": "Kochi", "whatsapp_number": "+919000000001", "slot_duration_min": 15}
        cr = c.post(f"{API}/admin/clinics", json=payload)
        assert cr.status_code == 200, cr.text
        new = cr.json()
        assert new["email"] == email and "_id" not in new
        cid = new["id"]
        lst = c.get(f"{API}/admin/clinics").json()
        assert len(lst) == before + 1
        assert any(x["id"] == cid for x in lst)

        dup = c.post(f"{API}/admin/clinics", json=payload)
        assert dup.status_code == 400, dup.text

        up = c.patch(f"{API}/admin/clinics/{cid}", json={"place": "Thrissur"})
        assert up.status_code == 200 and up.json()["place"] == "Thrissur"

        dl = c.delete(f"{API}/admin/clinics/{cid}")
        assert dl.status_code == 200
        assert not any(x["id"] == cid for x in c.get(f"{API}/admin/clinics").json())

    def test_holidays_crud(self, admin_token):
        c = auth(admin_token)
        r = c.get(f"{API}/admin/holidays")
        assert r.status_code == 200
        assert len(r.json()) >= 13
        assert any(h["date"] == "2026-08-15" for h in r.json())

        add = c.post(f"{API}/admin/holidays", json={"date": "2026-11-11", "name": "TEST_Holiday"})
        assert add.status_code == 200, add.text
        hid = add.json()["id"]
        assert any(h["id"] == hid for h in c.get(f"{API}/admin/holidays").json())

        bad = c.post(f"{API}/admin/holidays", json={"date": "11-11-2026", "name": "TEST_Bad"})
        assert bad.status_code == 400

        d = c.delete(f"{API}/admin/holidays/{hid}")
        assert d.status_code == 200
        assert not any(h["id"] == hid for h in c.get(f"{API}/admin/holidays").json())

    def test_stats(self, admin_token):
        c = auth(admin_token)
        r = c.get(f"{API}/admin/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["clinics", "patients", "appointments", "upcoming"]:
            assert isinstance(d[k], int), d
        assert d["clinics"] >= 1


# ---------- module: authorization ----------
class TestAuthorization:
    def test_missing_token_401(self, client):
        for url in [f"{API}/clinic/me", f"{API}/admin/stats", f"{API}/patient/appointments"]:
            assert client.get(url).status_code == 401, url

    def test_bad_token_401(self):
        c = auth("garbage.token.value")
        assert c.get(f"{API}/clinic/me").status_code == 401

    def test_patient_cannot_access_clinic_or_admin(self, patient_a):
        c = auth(patient_a["token"])
        assert c.get(f"{API}/clinic/me").status_code == 403
        assert c.get(f"{API}/admin/stats").status_code == 403

    def test_clinic_cannot_access_admin_or_patient(self, clinic_token):
        c = auth(clinic_token)
        assert c.get(f"{API}/admin/clinics").status_code == 403
        assert c.get(f"{API}/patient/appointments").status_code == 403

    def test_admin_cannot_access_clinic(self, admin_token):
        c = auth(admin_token)
        assert c.get(f"{API}/clinic/me").status_code == 403
