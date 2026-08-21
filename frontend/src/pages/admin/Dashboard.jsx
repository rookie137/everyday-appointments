import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useLang } from "@/lib/i18n";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function AdminDashboard() {
  const { t } = useLang();
  const [tab, setTab] = useState("clinics");
  const [clinics, setClinics] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [stats, setStats] = useState(null);
  const [showAddClinic, setShowAddClinic] = useState(false);
  const [showAddHoliday, setShowAddHoliday] = useState(false);

  const loadAll = async () => {
    try {
      const [c, h, s] = await Promise.all([
        api.get("/admin/clinics"),
        api.get("/admin/holidays"),
        api.get("/admin/stats"),
      ]);
      setClinics(c.data); setHolidays(h.data); setStats(s.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { loadAll(); }, []);

  const delClinic = async (id) => {
    if (!window.confirm(t("delete") + "?")) return;
    try { await api.delete(`/admin/clinics/${id}`); loadAll(); } catch (e) { toast.error(formatApiError(e)); }
  };
  const delHoliday = async (id) => {
    if (!window.confirm(t("delete") + "?")) return;
    try { await api.delete(`/admin/holidays/${id}`); loadAll(); } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <TopBar title={t("admin")} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 ea-fade">

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label={t("total_clinics")} value={stats.clinics} tId="stat-clinics" />
            <StatCard label={t("total_patients")} value={stats.patients} tId="stat-patients" />
            <StatCard label={t("total_bookings")} value={stats.appointments} tId="stat-appointments" />
            <StatCard label={t("upcoming")} value={stats.upcoming} tId="stat-upcoming" />
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <button data-testid="tab-clinics" onClick={()=>setTab("clinics")} className={"ea-btn " + (tab==="clinics" ? "ea-btn-primary" : "ea-btn-secondary")}>{t("clinics")}</button>
          <button data-testid="tab-holidays" onClick={()=>setTab("holidays")} className={"ea-btn " + (tab==="holidays" ? "ea-btn-primary" : "ea-btn-secondary")}>{t("holidays")}</button>
        </div>

        {tab === "clinics" && (
          <>
            <div className="flex justify-end mb-3">
              <button data-testid="add-clinic-btn" onClick={()=>setShowAddClinic(true)} className="ea-btn ea-btn-primary"><Plus size={18} /> {t("add_clinic")}</button>
            </div>
            <div className="ea-card overflow-hidden">
              {clinics.length === 0 && <p className="p-6 text-[#5A5850]" data-testid="clinics-empty">No clinics</p>}
              {clinics.map((c) => (
                <div key={c.id} data-testid={`admin-clinic-${c.id}`} className="p-4 border-b border-[#E1DBCB] last:border-0 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-bold">{c.name}</p>
                    <p className="text-sm text-[#5A5850]">{c.doctor_name} · {c.place} · {c.email}</p>
                    <p className="text-xs text-[#5A5850]">WA {c.whatsapp_number || "—"}</p>
                  </div>
                  <button data-testid={`del-clinic-${c.id}`} onClick={()=>delClinic(c.id)} className="ea-btn ea-btn-secondary text-[#B2402A]" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "holidays" && (
          <>
            <div className="flex justify-end mb-3">
              <button data-testid="add-holiday-btn" onClick={()=>setShowAddHoliday(true)} className="ea-btn ea-btn-primary"><Plus size={18} /> {t("add_holiday")}</button>
            </div>
            <div className="ea-card overflow-hidden">
              {holidays.length === 0 && <p className="p-6 text-[#5A5850]" data-testid="holidays-empty">No holidays</p>}
              {holidays.map((h) => (
                <div key={h.id} data-testid={`admin-holiday-${h.id}`} className="p-4 border-b border-[#E1DBCB] last:border-0 flex items-center gap-3">
                  <div className="rounded-lg bg-[#FFF4D6] text-[#6B4A00] px-3 py-1 font-mono">{h.date}</div>
                  <div className="flex-1 font-semibold">{h.name}</div>
                  <button data-testid={`del-holiday-${h.id}`} onClick={()=>delHoliday(h.id)} className="ea-btn ea-btn-secondary text-[#B2402A]" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {showAddClinic && <AddClinicModal onClose={()=>{setShowAddClinic(false); loadAll();}} />}
        {showAddHoliday && <AddHolidayModal onClose={()=>{setShowAddHoliday(false); loadAll();}} />}
      </main>
    </div>
  );
}

function StatCard({ label, value, tId }) {
  return (
    <div className="ea-card p-4" data-testid={tId}>
      <p className="text-sm text-[#5A5850]">{label}</p>
      <p className="font-bold text-2xl">{value}</p>
    </div>
  );
}

function AddClinicModal({ onClose }) {
  const { t } = useLang();
  const [f, setF] = useState({ name: "", doctor_name: "", email: "", place: "", whatsapp_number: "", slot_duration_min: 15 });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/clinics", f);
      toast.success("Added");
      onClose();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="ea-card w-full max-w-lg p-5 sm:p-6 space-y-4" onClick={(e)=>e.stopPropagation()} data-testid="add-clinic-modal">
        <h3 className="font-bold text-xl">{t("add_clinic")}</h3>
        <div><label className="ea-label">{t("clinic")}</label><input data-testid="ac-name" required className="ea-input" value={f.name} onChange={(e)=>setF({...f,name:e.target.value})} /></div>
        <div><label className="ea-label">{t("doctor")}</label><input data-testid="ac-doctor" required className="ea-input" value={f.doctor_name} onChange={(e)=>setF({...f,doctor_name:e.target.value})} /></div>
        <div><label className="ea-label">{t("email")}</label><input data-testid="ac-email" type="email" required className="ea-input" value={f.email} onChange={(e)=>setF({...f,email:e.target.value})} /></div>
        <div><label className="ea-label">{t("place")}</label><input data-testid="ac-place" required className="ea-input" value={f.place} onChange={(e)=>setF({...f,place:e.target.value})} /></div>
        <div><label className="ea-label">{t("whatsapp_number")}</label><input data-testid="ac-wa" required className="ea-input" placeholder="+91 98765 43210" value={f.whatsapp_number} onChange={(e)=>setF({...f,whatsapp_number:e.target.value})} /></div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="ea-btn ea-btn-secondary">{t("cancel")}</button>
          <button type="submit" data-testid="ac-submit" disabled={busy} className="ea-btn ea-btn-primary">{busy ? "…" : t("save")}</button>
        </div>
      </form>
    </div>
  );
}

function AddHolidayModal({ onClose }) {
  const { t } = useLang();
  const [f, setF] = useState({ date: "", name: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/holidays", f);
      onClose();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="ea-card w-full max-w-md p-5 sm:p-6 space-y-4" onClick={(e)=>e.stopPropagation()} data-testid="add-holiday-modal">
        <h3 className="font-bold text-xl">{t("add_holiday")}</h3>
        <div><label className="ea-label">{t("date")}</label><input data-testid="ah-date" type="date" required className="ea-input" value={f.date} onChange={(e)=>setF({...f,date:e.target.value})} /></div>
        <div><label className="ea-label">Name</label><input data-testid="ah-name" required className="ea-input" value={f.name} onChange={(e)=>setF({...f,name:e.target.value})} /></div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="ea-btn ea-btn-secondary">{t("cancel")}</button>
          <button type="submit" data-testid="ah-submit" disabled={busy} className="ea-btn ea-btn-primary">{busy ? "…" : t("save")}</button>
        </div>
      </form>
    </div>
  );
}
