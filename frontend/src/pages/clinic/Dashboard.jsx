import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "@/components/TopBar";
import { useLang, buildCancelMessage } from "@/lib/i18n";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Settings2, UserPlus, AlertTriangle } from "lucide-react";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function mapStatusKey(s) {
  return { waiting: "waiting", in_consultation: "in_consult", completed: "completed", no_show: "no_show", cancelled: "cancelled" }[s] || s;
}
function statusClass(s) {
  return { waiting: "pill-waiting", in_consultation: "pill-in", completed: "pill-done", no_show: "pill-noshow", cancelled: "pill-cancel" }[s] || "pill-done";
}

export default function ClinicDashboard() {
  const { t } = useLang();
  const [date, setDate] = useState(todayIso());
  const [view, setView] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState({ open: false, name: "", phone: "", place: "" });
  const [emergency, setEmergency] = useState({ open: false, affected: null });

  const load = async () => {
    try {
      const [c, v] = await Promise.all([
        api.get("/clinic/me"),
        api.get("/clinic/appointments", { params: { date } }),
      ]);
      setClinic(c.data);
      setView(v.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/clinic/appointments/${id}/status`, { status });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const submitWalkIn = async () => {
    setBusy(true);
    try {
      await api.post("/clinic/walk-in", { name: walkIn.name, phone: walkIn.phone, place: walkIn.place, date });
      toast.success("Added");
      setWalkIn({ open: false, name: "", phone: "", place: "" });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const runEmergencyCancel = async () => {
    if (!window.confirm(t("ec_confirm") + "?")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/clinic/emergency-cancel", { date });
      setEmergency({ open: true, affected: data });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <TopBar title={t("todays_ledger")} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 ea-fade">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input type="date" data-testid="ledger-date" value={date} onChange={(e)=>setDate(e.target.value)} className="ea-input" style={{ maxWidth: 200 }} />
          <button data-testid="btn-walk-in" onClick={()=>setWalkIn({ ...walkIn, open: true })} className="ea-btn ea-btn-secondary"><UserPlus size={18} /> {t("walk_in")}</button>
          <button data-testid="btn-emergency-cancel" onClick={runEmergencyCancel} className="ea-btn ea-btn-danger"><AlertTriangle size={18} /> {t("emergency_cancel")}</button>
          <Link to="/clinic/settings" data-testid="link-settings" className="ea-btn ea-btn-secondary ml-auto"><Settings2 size={18} /> {t("settings")}</Link>
        </div>

        {view?.status === "closed" && <div className="ea-card p-6 text-[#5A5850]" data-testid="closed-day">{t("sunday_closed")}</div>}
        {view?.status === "holiday" && <div className="ea-card p-6" data-testid="holiday-day"><p className="font-bold">{t("holiday")}</p><p className="text-[#5A5850]">{view.holiday_name}</p></div>}

        {view?.status === "open" && (
          <div className="ea-card overflow-hidden" data-testid="ledger-table">
            <div className="ledger-row ledger-head">
              <div>{t("token")}</div>
              <div>{t("time")}</div>
              <div>{t("patient_name")}</div>
              <div className="col-hide-sm">{t("place")}</div>
              <div className="col-hide-sm">{t("phone")}</div>
              <div>{t("action")}</div>
            </div>
            {(view.ledger || []).length === 0 && (
              <div className="p-8 text-[#5A5850]" data-testid="ledger-empty">No bookings for this date.</div>
            )}
            {(view.ledger || []).map((row) => (
              <div key={row.appointment_id} className="ledger-row" data-testid={`ledger-row-${row.token}`}>
                <div className="font-bold">#{row.token}</div>
                <div className="font-mono">{row.time}</div>
                <div>
                  <div className="font-semibold">{row.patient_name || "—"}</div>
                  <div className="sm:hidden text-xs text-[#5A5850]">{row.patient_place} · {row.patient_phone}</div>
                  <div className="sm:hidden mt-1"><span className={"status-pill " + statusClass(row.status)}>{t(mapStatusKey(row.status))}</span></div>
                </div>
                <div className="col-hide-sm text-[#5A5850]">{row.patient_place || "—"}</div>
                <div className="col-hide-sm text-[#5A5850]">{row.patient_phone || "—"}</div>
                <div className="flex items-center gap-2">
                  <select data-testid={`status-select-${row.token}`} value={row.status || "waiting"} onChange={(e)=>updateStatus(row.appointment_id, e.target.value)} className="ea-select" style={{ minHeight: 44, padding: "0.35rem 0.55rem", fontSize: "0.9rem" }}>
                    <option value="waiting">{t("waiting")}</option>
                    <option value="in_consultation">{t("in_consult")}</option>
                    <option value="completed">{t("completed")}</option>
                    <option value="no_show">{t("no_show")}</option>
                    <option value="cancelled">{t("cancelled")}</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {walkIn.open && (
          <Modal onClose={()=>setWalkIn({ ...walkIn, open: false })} title={t("walk_in")}>
            <div className="space-y-4">
              <div><label className="ea-label">{t("patient_name")}</label><input data-testid="walk-in-name" className="ea-input" value={walkIn.name} onChange={(e)=>setWalkIn({...walkIn, name: e.target.value})} /></div>
              <div><label className="ea-label">{t("phone")}</label><input data-testid="walk-in-phone" className="ea-input" value={walkIn.phone} onChange={(e)=>setWalkIn({...walkIn, phone: e.target.value})} /></div>
              <div><label className="ea-label">{t("place")}</label><input data-testid="walk-in-place" className="ea-input" value={walkIn.place} onChange={(e)=>setWalkIn({...walkIn, place: e.target.value})} /></div>
              <button data-testid="walk-in-submit" disabled={busy || !walkIn.name || !walkIn.phone} onClick={submitWalkIn} className="ea-btn ea-btn-primary w-full">{t("continue")}</button>
            </div>
          </Modal>
        )}

        {emergency.open && emergency.affected && (
          <Modal onClose={()=>setEmergency({ open: false, affected: null })} title={t("affected_patients")}>
            <p className="text-sm text-[#5A5850] mb-3">{t("ec_note")}</p>
            {emergency.affected.affected.length === 0 && <p className="text-[#5A5850]" data-testid="ec-none">No affected patients.</p>}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {emergency.affected.affected.map((p) => {
                const msg = buildCancelMessage({ clinicName: clinic?.name, date, patientName: p.name, time: p.slot_time, token: p.token_number });
                const wa = (p.phone || "").replace(/\D/g, "");
                const url = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : null;
                return (
                  <div key={p.id} data-testid={`ec-row-${p.token_number}`} className="border-2 border-[#E1DBCB] rounded-xl p-3 flex items-center gap-3">
                    <div className="rounded-lg bg-[#FBE8E4] text-[#B2402A] px-2 py-1 text-sm font-bold min-w-[52px] text-center">#{p.token_number}</div>
                    <div className="flex-1">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-[#5A5850]">{p.phone} · {p.slot_time}</p>
                    </div>
                    {url ? (
                      <a data-testid={`ec-wa-${p.token_number}`} href={url} target="_blank" rel="noopener noreferrer" className="ea-btn ea-btn-wa" style={{ minHeight: 44, padding: "0.5rem 0.85rem", fontSize: "0.9rem" }}>WA</a>
                    ) : <span className="text-xs text-[#B2402A]">No phone</span>}
                  </div>
                );
              })}
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}

function Modal({ children, title, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="ea-card w-full max-w-lg p-5 sm:p-6" onClick={(e)=>e.stopPropagation()} data-testid="modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-xl">{title}</h3>
          <button data-testid="modal-close" onClick={onClose} className="ea-btn ea-btn-secondary" style={{ minHeight: 40, padding: "0.4rem 0.7rem" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
