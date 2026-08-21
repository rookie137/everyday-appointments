import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TopBar from "@/components/TopBar";
import { useLang } from "@/lib/i18n";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

function pad(n) { return String(n).padStart(2, "0"); }
function toIso(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

export default function PatientBooking() {
  const { t } = useLang();
  const { clinicId } = useParams();
  const nav = useNavigate();
  const [clinic, setClinic] = useState(null);
  const [dateIso, setDateIso] = useState(toIso(new Date()));
  const [view, setView] = useState(null);
  const [slot, setSlot] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/clinics/${clinicId}`);
        setClinic(data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [clinicId]);

  useEffect(() => {
    if (!clinic) return;
    setSlot(null);
    (async () => {
      try {
        const { data } = await api.get(`/clinics/${clinicId}/slots`, { params: { date: dateIso } });
        setView(data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [clinic, dateIso, clinicId]);

  const days = useMemo(() => {
    if (!clinic) return [];
    const arr = [];
    const today = new Date();
    for (let i = 0; i < Math.min(clinic.advance_booking_days || 45, 30); i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [clinic]);

  const dayNames = [t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat"), t("sun")];

  const confirm = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/patient/book/${clinicId}`, { date: dateIso, slot_time: slot.time });
      nav(`/patient/receipt/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  if (!clinic) return <div className="min-h-screen bg-[#F8F5EF]"><TopBar backTo="/patient" /><div className="p-8 text-[#5A5850]">…</div></div>;

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <TopBar title={clinic.name} backTo="/patient" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5 ea-fade">
        <p className="text-[#5A5850]">{clinic.doctor_name} · {clinic.place}</p>

        <h2 className="font-bold text-2xl mt-6 mb-3">{t("select_date")}</h2>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" data-testid="date-strip">
          {days.map((d) => {
            const iso = toIso(d);
            const disabled = false;
            const selected = iso === dateIso;
            const jsDow = (d.getDay() + 6) % 7; // 0=Mon
            return (
              <button
                key={iso}
                data-testid={`date-${iso}`}
                onClick={() => !disabled && setDateIso(iso)}
                disabled={disabled}
                className={"day-chip" + (selected ? " selected" : "") + (disabled ? " disabled" : "")}
              >
                <div className="text-xs opacity-70">{dayNames[jsDow]}</div>
                <div className="text-lg font-bold">{pad(d.getDate())}</div>
                <div className="text-xs opacity-70">{pad(d.getMonth()+1)}</div>
              </button>
            );
          })}
        </div>

        <h2 className="font-bold text-2xl mt-6 mb-3">{t("select_slot")}</h2>
        {view?.status === "closed" && (
          <div className="ea-card p-6 text-[#5A5850]" data-testid="day-closed">{t("sunday_closed")}</div>
        )}
        {view?.status === "holiday" && (
          <div className="ea-card p-6" data-testid="day-holiday">
            <p className="font-bold text-lg">{t("holiday")}</p>
            <p className="text-[#5A5850]">{view.holiday_name}</p>
          </div>
        )}
        {view?.status === "open" && view.slots.length === 0 && (
          <div className="ea-card p-6 text-[#5A5850]">{t("no_slots")}</div>
        )}
        {view?.status === "open" && view.slots.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {view.slots.map((s) => {
              const isSelected = slot?.time === s.time;
              const cls = s.available ? "slot-available" : "slot-booked";
              return (
                <button
                  key={s.time}
                  data-testid={`slot-${s.time}`}
                  disabled={!s.available}
                  onClick={() => s.available && setSlot(s)}
                  className={"slot-card " + cls + (isSelected ? " slot-selected" : "")}
                >
                  <div className="font-bold text-xl">{s.time}</div>
                  <div className="text-sm">{t("token")} #{s.token}</div>
                  <div className="text-xs mt-1">{s.available ? t("available") : t("booked")}</div>
                </button>
              );
            })}
          </div>
        )}

        <div className="sticky bottom-3 mt-8">
          <button data-testid="confirm-booking" disabled={!slot || busy} onClick={confirm} className="ea-btn ea-btn-primary w-full text-lg" style={{ minHeight: 60 }}>
            {busy ? "…" : slot ? `${t("confirm_booking")} · ${t("token")} #${slot.token}` : t("select_slot")}
          </button>
        </div>
      </main>
    </div>
  );
}
