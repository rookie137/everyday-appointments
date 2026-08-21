from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import secrets
import random
import re
from datetime import datetime, timezone, timedelta, date as ddate, time as dtime
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("everyday")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Everyday Appointments")
api = APIRouter(prefix="/api")

JWT_ALGO = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
SUPER_ADMIN_EMAIL = os.environ["SUPER_ADMIN_EMAIL"].lower()
SUPER_ADMIN_PASSWORD = os.environ["SUPER_ADMIN_PASSWORD"]

# ---- Helpers ----
def now_utc() -> datetime: return datetime.now(timezone.utc)

def hash_pw(pw: str) -> str: return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
def verify_pw(pw: str, h: str) -> bool: return bcrypt.checkpw(pw.encode(), h.encode())

def make_token(role: str, user_id: str, extra: dict = None) -> str:
    payload = {"sub": user_id, "role": role, "exp": now_utc() + timedelta(days=30)}
    if extra: payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])

def normalize_phone(p: str) -> str:
    return re.sub(r"[^\d+]", "", (p or "").strip())

def gen_otp() -> str:
    return f"{random.randint(0, 999999):06d}"

async def get_bearer(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        return decode_token(auth[7:])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def require_patient(request: Request) -> dict:
    p = await get_bearer(request)
    if p.get("role") != "patient": raise HTTPException(403, "Not a patient")
    doc = await db.patients.find_one({"_id": ObjectId(p["sub"])})
    if not doc: raise HTTPException(401, "Patient not found")
    doc["id"] = str(doc.pop("_id"))
    return doc

async def require_clinic(request: Request) -> dict:
    p = await get_bearer(request)
    if p.get("role") != "clinic": raise HTTPException(403, "Not a clinic admin")
    doc = await db.clinics.find_one({"_id": ObjectId(p["sub"])})
    if not doc: raise HTTPException(401, "Clinic not found")
    doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc

async def require_admin(request: Request) -> dict:
    p = await get_bearer(request)
    if p.get("role") != "admin": raise HTTPException(403, "Not admin")
    return p

# ---- Models ----
class PatientOtpReq(BaseModel):
    phone: str

class PatientOtpVerify(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None
    place: Optional[str] = None
    address: Optional[str] = None

class ClinicOtpReq(BaseModel):
    email: EmailStr

class ClinicOtpVerify(BaseModel):
    email: EmailStr
    code: str

class AdminLogin(BaseModel):
    email: str
    password: str

class ClinicCreateIn(BaseModel):
    name: str
    doctor_name: str
    email: EmailStr
    place: str
    whatsapp_number: str  # E.164 or plain digits
    slot_duration_min: int = 15
    working_days: List[int] = [0, 1, 2, 3, 4, 5]  # Mon..Sat
    start_time: str = "09:00"
    end_time: str = "17:00"
    breaks: List[dict] = Field(default_factory=list)  # [{start, end}]
    advance_booking_days: int = 45

class ClinicUpdateIn(BaseModel):
    name: Optional[str] = None
    doctor_name: Optional[str] = None
    place: Optional[str] = None
    whatsapp_number: Optional[str] = None
    slot_duration_min: Optional[int] = Field(default=None, ge=5, le=120)
    working_days: Optional[List[int]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    breaks: Optional[List[dict]] = None
    advance_booking_days: Optional[int] = Field(default=None, ge=1, le=180)

class HolidayIn(BaseModel):
    date: str  # YYYY-MM-DD
    name: str

class BookIn(BaseModel):
    date: str  # YYYY-MM-DD
    slot_time: str  # HH:MM

class WalkInIn(BaseModel):
    name: str
    phone: str
    place: Optional[str] = ""
    date: str
    slot_time: Optional[str] = None  # if None, assign next available

class StatusUpdateIn(BaseModel):
    status: Literal["waiting", "in_consultation", "completed", "no_show", "cancelled"]

class EmergencyCancelIn(BaseModel):
    date: str
    from_time: Optional[str] = None
    to_time: Optional[str] = None

# ---- Slot engine ----
def parse_hm(s: str):
    h, m = s.split(":")
    return dtime(int(h), int(m))

def combine_dt(d: ddate, t: dtime):
    return datetime.combine(d, t)

async def build_day_view(clinic: dict, date_str: str):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Bad date")
    weekday = d.weekday()  # 0=Mon
    if weekday not in clinic.get("working_days", []):
        return {"date": date_str, "status": "closed", "reason": "sunday" if weekday == 6 else "closed", "slots": []}
    holiday = await db.holidays.find_one({"date": date_str})
    if holiday:
        return {"date": date_str, "status": "holiday", "reason": "holiday", "holiday_name": holiday["name"], "slots": []}

    start_t = parse_hm(clinic.get("start_time", "09:00"))
    end_t = parse_hm(clinic.get("end_time", "17:00"))
    dur = int(clinic.get("slot_duration_min", 15))
    breaks = clinic.get("breaks", []) or []

    cur = combine_dt(d, start_t)
    end_dt = combine_dt(d, end_t)

    # Load booked appointments for this date & clinic
    booked_docs = await db.appointments.find({
        "clinic_id": clinic["id"] if "id" in clinic else str(clinic["_id"]),
        "date": date_str,
        "status": {"$in": ["waiting", "in_consultation", "completed", "no_show"]},
    }).to_list(500)
    booked_map = {b["slot_time"]: b for b in booked_docs}

    slots = []
    token = 1
    while cur + timedelta(minutes=dur) <= end_dt:
        in_break = False
        for br in breaks:
            try:
                bs = combine_dt(d, parse_hm(br.get("start")))
                be = combine_dt(d, parse_hm(br.get("end")))
                if cur >= bs and cur < be:
                    in_break = True; break
            except Exception:
                continue
        if not in_break:
            slot_time = cur.strftime("%H:%M")
            b = booked_map.get(slot_time)
            slots.append({
                "token": token,
                "time": slot_time,
                "available": b is None,
                "appointment_id": str(b["_id"]) if b else None,
                "patient_name": b.get("patient_name") if b else None,
                "patient_phone": b.get("patient_phone") if b else None,
                "patient_place": b.get("patient_place") if b else None,
                "status": b.get("status") if b else None,
            })
            token += 1
        cur += timedelta(minutes=dur)

    return {"date": date_str, "status": "open", "slots": slots}

# ---- Public endpoints ----
@api.get("/")
async def root():
    return {"app": "Everyday Appointments", "ok": True}

@api.get("/clinics")
async def list_clinics_public():
    docs = await db.clinics.find({}).sort("name", 1).to_list(200)
    out = []
    for c in docs:
        out.append({
            "id": str(c["_id"]),
            "name": c["name"],
            "doctor_name": c.get("doctor_name", ""),
            "place": c.get("place", ""),
            "whatsapp_number": c.get("whatsapp_number", ""),
            "slot_duration_min": c.get("slot_duration_min", 15),
        })
    return out

@api.get("/clinics/{clinic_id}")
async def get_clinic_public(clinic_id: str):
    try:
        c = await db.clinics.find_one({"_id": ObjectId(clinic_id)})
    except Exception:
        raise HTTPException(400, "Bad id")
    if not c: raise HTTPException(404, "Not found")
    return {
        "id": str(c["_id"]), "name": c["name"], "doctor_name": c.get("doctor_name", ""),
        "place": c.get("place", ""), "whatsapp_number": c.get("whatsapp_number", ""),
        "slot_duration_min": c.get("slot_duration_min", 15),
        "working_days": c.get("working_days", []),
        "advance_booking_days": c.get("advance_booking_days", 45),
    }

@api.get("/clinics/{clinic_id}/slots")
async def get_slots(clinic_id: str, date: str):
    try:
        c = await db.clinics.find_one({"_id": ObjectId(clinic_id)})
    except Exception:
        raise HTTPException(400, "Bad id")
    if not c: raise HTTPException(404, "Clinic not found")
    c["id"] = str(c["_id"])
    return await build_day_view(c, date)

@api.get("/holidays")
async def public_holidays():
    docs = await db.holidays.find({}).sort("date", 1).to_list(500)
    return [{"id": str(h["_id"]), "date": h["date"], "name": h["name"]} for h in docs]

# ---- Auth: Patient (mock OTP) ----
@api.post("/auth/patient/request-otp")
async def patient_request_otp(body: PatientOtpReq):
    phone = normalize_phone(body.phone)
    if len(phone.replace("+", "")) < 8:
        raise HTTPException(400, "Invalid phone number")
    code = gen_otp()
    await db.otp_codes.update_one(
        {"identifier": phone, "kind": "patient"},
        {"$set": {"code": code, "expires_at": (now_utc() + timedelta(minutes=10)).isoformat(), "used": False, "created_at": now_utc().isoformat()}},
        upsert=True,
    )
    logger.info(f"[OTP MOCK] patient {phone} => {code}")
    # For demo/MVP: return OTP so users without SMS provider can verify.
    return {"sent": True, "demo_otp": code, "phone": phone}

@api.post("/auth/patient/verify-otp")
async def patient_verify_otp(body: PatientOtpVerify):
    phone = normalize_phone(body.phone)
    rec = await db.otp_codes.find_one({"identifier": phone, "kind": "patient"})
    if not rec or rec.get("used"):
        raise HTTPException(400, "OTP not found. Request a new one.")
    if datetime.fromisoformat(rec["expires_at"]) < now_utc():
        raise HTTPException(400, "OTP expired")
    if rec["code"] != body.code.strip():
        raise HTTPException(400, "Wrong OTP")
    await db.otp_codes.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})

    existing = await db.patients.find_one({"phone_number": phone})
    if existing:
        # Update fields if provided
        updates = {}
        if body.name: updates["name"] = body.name.strip()
        if body.place is not None: updates["place"] = body.place.strip()
        if body.address is not None: updates["address"] = body.address.strip()
        if updates:
            await db.patients.update_one({"_id": existing["_id"]}, {"$set": updates})
        pid = str(existing["_id"])
    else:
        if not body.name:
            raise HTTPException(400, "Name required for new patient")
        doc = {
            "name": body.name.strip(),
            "phone_number": phone,
            "place": (body.place or "").strip(),
            "address": (body.address or "").strip(),
            "created_at": now_utc().isoformat(),
        }
        res = await db.patients.insert_one(doc)
        pid = str(res.inserted_id)

    patient = await db.patients.find_one({"_id": ObjectId(pid)})
    patient["id"] = str(patient.pop("_id"))
    token = make_token("patient", pid)
    return {"token": token, "patient": patient}

# ---- Auth: Clinic ----
@api.post("/auth/clinic/request-otp")
async def clinic_request_otp(body: ClinicOtpReq):
    email = body.email.lower()
    c = await db.clinics.find_one({"email": email})
    if not c:
        raise HTTPException(404, "No clinic with that email. Contact the platform admin.")
    code = gen_otp()
    await db.otp_codes.update_one(
        {"identifier": email, "kind": "clinic"},
        {"$set": {"code": code, "expires_at": (now_utc() + timedelta(minutes=10)).isoformat(), "used": False, "created_at": now_utc().isoformat()}},
        upsert=True,
    )
    logger.info(f"[OTP MOCK] clinic {email} => {code}")
    return {"sent": True, "demo_otp": code, "email": email}

@api.post("/auth/clinic/verify-otp")
async def clinic_verify_otp(body: ClinicOtpVerify):
    email = body.email.lower()
    rec = await db.otp_codes.find_one({"identifier": email, "kind": "clinic"})
    if not rec or rec.get("used"):
        raise HTTPException(400, "OTP not found. Request a new one.")
    if datetime.fromisoformat(rec["expires_at"]) < now_utc():
        raise HTTPException(400, "OTP expired")
    if rec["code"] != body.code.strip():
        raise HTTPException(400, "Wrong OTP")
    await db.otp_codes.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    c = await db.clinics.find_one({"email": email})
    cid = str(c["_id"])
    c["id"] = cid; c.pop("_id", None); c.pop("password_hash", None)
    token = make_token("clinic", cid)
    return {"token": token, "clinic": c}

@api.post("/auth/admin/login")
async def admin_login(body: AdminLogin):
    if body.email.lower() != SUPER_ADMIN_EMAIL or body.password != SUPER_ADMIN_PASSWORD:
        raise HTTPException(401, "Invalid credentials")
    token = make_token("admin", "super", {"email": SUPER_ADMIN_EMAIL})
    return {"token": token, "admin": {"email": SUPER_ADMIN_EMAIL, "role": "admin"}}

@api.get("/auth/me")
async def auth_me(request: Request):
    payload = await get_bearer(request)
    role = payload.get("role")
    if role == "patient":
        u = await db.patients.find_one({"_id": ObjectId(payload["sub"])})
        if not u: raise HTTPException(401, "Not found")
        u["id"] = str(u.pop("_id"))
        return {"role": "patient", "user": u}
    if role == "clinic":
        u = await db.clinics.find_one({"_id": ObjectId(payload["sub"])})
        if not u: raise HTTPException(401, "Not found")
        u["id"] = str(u.pop("_id")); u.pop("password_hash", None)
        return {"role": "clinic", "user": u}
    if role == "admin":
        return {"role": "admin", "user": {"email": payload.get("email")}}
    raise HTTPException(401, "Unknown role")

# ---- Patient endpoints ----
@api.post("/patient/book/{clinic_id}")
async def patient_book(clinic_id: str, body: BookIn, patient: dict = Depends(require_patient)):
    try:
        c = await db.clinics.find_one({"_id": ObjectId(clinic_id)})
    except Exception:
        raise HTTPException(400, "Bad clinic id")
    if not c: raise HTTPException(404, "Clinic not found")
    c["id"] = str(c["_id"])

    view = await build_day_view(c, body.date)
    if view["status"] != "open":
        raise HTTPException(400, f"Day not bookable ({view['status']})")
    match = next((s for s in view["slots"] if s["time"] == body.slot_time and s["available"]), None)
    if not match:
        raise HTTPException(409, "Slot not available")

    doc = {
        "clinic_id": clinic_id,
        "patient_id": patient["id"],
        "patient_name": patient["name"],
        "patient_phone": patient["phone_number"],
        "patient_place": patient.get("place", ""),
        "token_number": match["token"],
        "date": body.date,
        "slot_time": body.slot_time,
        "status": "waiting",
        "created_by": "patient",
        "created_at": now_utc().isoformat(),
    }
    try:
        res = await db.appointments.insert_one(doc)
    except Exception:
        raise HTTPException(409, "Slot already booked")

    return {
        "id": str(res.inserted_id),
        "clinic": {"id": clinic_id, "name": c["name"], "doctor_name": c.get("doctor_name", ""), "place": c.get("place", ""), "whatsapp_number": c.get("whatsapp_number", "")},
        "date": body.date,
        "slot_time": body.slot_time,
        "token_number": match["token"],
        "status": "waiting",
    }

@api.get("/patient/appointments")
async def patient_appointments(patient: dict = Depends(require_patient)):
    docs = await db.appointments.find({"patient_id": patient["id"]}).sort("date", -1).to_list(500)
    out = []
    for a in docs:
        clinic = await db.clinics.find_one({"_id": ObjectId(a["clinic_id"])})
        out.append({
            "id": str(a["_id"]),
            "date": a["date"],
            "slot_time": a["slot_time"],
            "token_number": a["token_number"],
            "status": a["status"],
            "clinic": {
                "id": a["clinic_id"],
                "name": clinic["name"] if clinic else "",
                "doctor_name": clinic.get("doctor_name", "") if clinic else "",
                "place": clinic.get("place", "") if clinic else "",
                "whatsapp_number": clinic.get("whatsapp_number", "") if clinic else "",
            },
        })
    return out

@api.post("/patient/appointments/{appt_id}/cancel")
async def patient_cancel(appt_id: str, patient: dict = Depends(require_patient)):
    try:
        a = await db.appointments.find_one({"_id": ObjectId(appt_id), "patient_id": patient["id"]})
    except Exception:
        raise HTTPException(400, "Bad id")
    if not a: raise HTTPException(404, "Not found")
    if a["status"] == "cancelled":
        return {"ok": True}
    await db.appointments.update_one({"_id": a["_id"]}, {"$set": {"status": "cancelled"}})
    return {"ok": True}

# ---- Clinic admin endpoints ----
@api.get("/clinic/me")
async def clinic_me(clinic: dict = Depends(require_clinic)):
    return clinic

@api.patch("/clinic/me")
async def clinic_update(body: ClinicUpdateIn, clinic: dict = Depends(require_clinic)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if updates:
        await db.clinics.update_one({"_id": ObjectId(clinic["id"])}, {"$set": updates})
    c = await db.clinics.find_one({"_id": ObjectId(clinic["id"])})
    c["id"] = str(c.pop("_id")); c.pop("password_hash", None)
    return c

@api.get("/clinic/appointments")
async def clinic_appts(date: Optional[str] = None, clinic: dict = Depends(require_clinic)):
    date_str = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    view = await build_day_view(clinic, date_str)
    # Also include the ledger sorted by token number
    ledger = [s for s in view.get("slots", []) if s.get("appointment_id")]
    ledger.sort(key=lambda s: s["token"])
    return {"date": date_str, "status": view["status"], "reason": view.get("reason"), "holiday_name": view.get("holiday_name"), "slots": view.get("slots", []), "ledger": ledger}

@api.patch("/clinic/appointments/{appt_id}/status")
async def clinic_update_status(appt_id: str, body: StatusUpdateIn, clinic: dict = Depends(require_clinic)):
    try:
        a = await db.appointments.find_one({"_id": ObjectId(appt_id), "clinic_id": clinic["id"]})
    except Exception:
        raise HTTPException(400, "Bad id")
    if not a: raise HTTPException(404, "Not found")
    await db.appointments.update_one({"_id": a["_id"]}, {"$set": {"status": body.status}})
    return {"ok": True}

@api.post("/clinic/walk-in")
async def clinic_walk_in(body: WalkInIn, clinic: dict = Depends(require_clinic)):
    view = await build_day_view(clinic, body.date)
    if view["status"] != "open":
        raise HTTPException(400, f"Day not bookable ({view['status']})")
    slot = None
    if body.slot_time:
        slot = next((s for s in view["slots"] if s["time"] == body.slot_time and s["available"]), None)
        if not slot: raise HTTPException(409, "Slot not available")
    else:
        slot = next((s for s in view["slots"] if s["available"]), None)
        if not slot: raise HTTPException(409, "No available slots")

    phone = normalize_phone(body.phone)
    # Find or create a patient
    existing = await db.patients.find_one({"phone_number": phone})
    if existing:
        pid = str(existing["_id"])
    else:
        pd = {"name": body.name.strip(), "phone_number": phone, "place": (body.place or "").strip(), "address": "", "created_at": now_utc().isoformat()}
        res = await db.patients.insert_one(pd)
        pid = str(res.inserted_id)

    doc = {
        "clinic_id": clinic["id"], "patient_id": pid,
        "patient_name": body.name.strip(), "patient_phone": phone, "patient_place": (body.place or "").strip(),
        "token_number": slot["token"], "date": body.date, "slot_time": slot["time"],
        "status": "waiting", "created_by": "admin", "created_at": now_utc().isoformat(),
    }
    try:
        res = await db.appointments.insert_one(doc)
    except Exception:
        raise HTTPException(409, "Slot already booked")
    return {"id": str(res.inserted_id), "token_number": slot["token"], "slot_time": slot["time"], "date": body.date}

@api.post("/clinic/emergency-cancel")
async def clinic_emergency_cancel(body: EmergencyCancelIn, clinic: dict = Depends(require_clinic)):
    q = {"clinic_id": clinic["id"], "date": body.date, "status": {"$in": ["waiting", "in_consultation"]}}
    if body.from_time and body.to_time:
        q["slot_time"] = {"$gte": body.from_time, "$lte": body.to_time}
    elif body.from_time:
        q["slot_time"] = {"$gte": body.from_time}
    elif body.to_time:
        q["slot_time"] = {"$lte": body.to_time}
    affected_docs = await db.appointments.find(q).to_list(500)
    if not affected_docs:
        return {"cancelled": 0, "affected": []}
    ids = [d["_id"] for d in affected_docs]
    await db.appointments.update_many({"_id": {"$in": ids}}, {"$set": {"status": "cancelled"}})
    affected = [{
        "id": str(d["_id"]),
        "name": d.get("patient_name", ""),
        "phone": d.get("patient_phone", ""),
        "slot_time": d["slot_time"],
        "token_number": d["token_number"],
    } for d in affected_docs]
    return {"cancelled": len(affected), "affected": affected, "clinic_name": clinic.get("name", ""), "date": body.date}

# ---- Super admin endpoints ----
@api.get("/admin/clinics")
async def admin_list_clinics(admin: dict = Depends(require_admin)):
    docs = await db.clinics.find({}).sort("name", 1).to_list(500)
    out = []
    for c in docs:
        out.append({
            "id": str(c["_id"]),
            "name": c["name"], "doctor_name": c.get("doctor_name", ""), "email": c["email"],
            "place": c.get("place", ""), "whatsapp_number": c.get("whatsapp_number", ""),
            "slot_duration_min": c.get("slot_duration_min", 15),
            "working_days": c.get("working_days", []),
            "start_time": c.get("start_time", "09:00"), "end_time": c.get("end_time", "17:00"),
            "breaks": c.get("breaks", []),
            "advance_booking_days": c.get("advance_booking_days", 45),
        })
    return out

@api.post("/admin/clinics")
async def admin_create_clinic(body: ClinicCreateIn, admin: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.clinics.find_one({"email": email}):
        raise HTTPException(400, "Clinic with this email already exists")
    doc = body.model_dump()
    doc["email"] = email
    doc["whatsapp_number"] = normalize_phone(body.whatsapp_number)
    doc["created_at"] = now_utc().isoformat()
    res = await db.clinics.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc

@api.patch("/admin/clinics/{clinic_id}")
async def admin_update_clinic(clinic_id: str, body: ClinicUpdateIn, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "whatsapp_number" in updates:
        updates["whatsapp_number"] = normalize_phone(updates["whatsapp_number"])
    if updates:
        await db.clinics.update_one({"_id": ObjectId(clinic_id)}, {"$set": updates})
    c = await db.clinics.find_one({"_id": ObjectId(clinic_id)})
    if not c: raise HTTPException(404, "Not found")
    c["id"] = str(c.pop("_id")); c.pop("password_hash", None)
    return c

@api.delete("/admin/clinics/{clinic_id}")
async def admin_delete_clinic(clinic_id: str, admin: dict = Depends(require_admin)):
    await db.clinics.delete_one({"_id": ObjectId(clinic_id)})
    return {"ok": True}

@api.get("/admin/holidays")
async def admin_list_holidays(admin: dict = Depends(require_admin)):
    docs = await db.holidays.find({}).sort("date", 1).to_list(500)
    return [{"id": str(h["_id"]), "date": h["date"], "name": h["name"]} for h in docs]

@api.post("/admin/holidays")
async def admin_add_holiday(body: HolidayIn, admin: dict = Depends(require_admin)):
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Bad date")
    existing = await db.holidays.find_one({"date": body.date})
    if existing:
        await db.holidays.update_one({"_id": existing["_id"]}, {"$set": {"name": body.name}})
        return {"id": str(existing["_id"]), "date": body.date, "name": body.name}
    res = await db.holidays.insert_one({"date": body.date, "name": body.name, "created_at": now_utc().isoformat()})
    return {"id": str(res.inserted_id), "date": body.date, "name": body.name}

@api.delete("/admin/holidays/{holiday_id}")
async def admin_delete_holiday(holiday_id: str, admin: dict = Depends(require_admin)):
    await db.holidays.delete_one({"_id": ObjectId(holiday_id)})
    return {"ok": True}

@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    clinics = await db.clinics.count_documents({})
    patients = await db.patients.count_documents({})
    appts = await db.appointments.count_documents({})
    upcoming = await db.appointments.count_documents({"status": {"$in": ["waiting", "in_consultation"]}})
    return {"clinics": clinics, "patients": patients, "appointments": appts, "upcoming": upcoming}

# ---- Seed defaults ----
DEFAULT_KERALA_HOLIDAYS_2026 = [
    ("2026-01-01", "New Year's Day"),
    ("2026-01-14", "Makara Sankranti"),
    ("2026-01-26", "Republic Day"),
    ("2026-03-04", "Holi"),
    ("2026-03-20", "Eid al-Fitr"),
    ("2026-04-14", "Vishu"),
    ("2026-04-15", "Good Friday"),
    ("2026-05-27", "Eid al-Adha"),
    ("2026-08-15", "Independence Day"),
    ("2026-08-26", "Onam - Thiruvonam"),
    ("2026-10-02", "Gandhi Jayanti"),
    ("2026-10-20", "Diwali"),
    ("2026-12-25", "Christmas Day"),
]

@app.on_event("startup")
async def startup():
    await db.clinics.create_index("email", unique=True)
    await db.patients.create_index("phone_number", unique=True)
    await db.holidays.create_index("date", unique=True)
    await db.appointments.create_index([("clinic_id", 1), ("date", 1), ("slot_time", 1)], name="clinic_date_slot")
    await db.appointments.create_index(
        [("clinic_id", 1), ("date", 1), ("slot_time", 1)],
        name="clinic_date_slot_unique_active",
        unique=True,
        partialFilterExpression={"status": {"$in": ["waiting", "in_consultation", "completed", "no_show"]}}
    )
    await db.otp_codes.create_index([("identifier", 1), ("kind", 1)])

    # Seed holidays if empty
    count = await db.holidays.count_documents({})
    if count == 0:
        docs = [{"date": d, "name": n, "created_at": now_utc().isoformat()} for d, n in DEFAULT_KERALA_HOLIDAYS_2026]
        await db.holidays.insert_many(docs)
        logger.info(f"Seeded {len(docs)} default holidays")

    # Seed a demo clinic if none
    if await db.clinics.count_documents({}) == 0:
        demo = {
            "name": "Kannur Family Clinic",
            "doctor_name": "Dr. Suresh Menon",
            "email": "demo@clinic.example.com",
            "place": "Kannur",
            "whatsapp_number": "+919876543210",
            "slot_duration_min": 15,
            "working_days": [0, 1, 2, 3, 4, 5],
            "start_time": "09:00",
            "end_time": "17:00",
            "breaks": [{"start": "13:00", "end": "14:00"}],
            "advance_booking_days": 45,
            "created_at": now_utc().isoformat(),
        }
        await db.clinics.insert_one(demo)
        logger.info("Seeded demo clinic")

    logger.info("Everyday Appointments ready")

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
