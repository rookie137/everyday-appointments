import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useLang } from "@/lib/i18n";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];

export default function ClinicSettings() {
  const { t } = useLang();
  const [c, setC] = useState(null);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/clinic/me"); setC(data); }
      catch (e) { toast.error(formatApiError(e)); }
    })();
  }, []);

  if (!c) return <div className="min-h-screen bg-[#F8F5EF]"><TopBar backTo="/clinic" /><p className="p-8 text-[#5A5850]">…</p></div>;

  const set = (k, v) => setC({ ...c, [k]: v });

  const toggleDay = (i) => {
    const days = new Set(c.working_days || []);
    days.has(i) ? days.delete(i) : days.add(i);
    set("working_days", Array.from(days).sort());
  };

  const addBreak = () => set("breaks", [...(c.breaks || []), { start: "13:00", end: "14:00" }]);
  const rmBreak = (i) => set("breaks", c.breaks.filter((_, idx) => idx !== i));
  const setBreak = (i, k, v) => {
    const copy = [...(c.breaks || [])];
    copy[i] = { ...copy[i], [k]: v };
    set("breaks", copy);
  };

  const save = async () => {
    try {
      const body = {
        name: c.name, doctor_name: c.doctor_name, place: c.place,
        whatsapp_number: c.whatsapp_number,
        slot_duration_min: parseInt(c.slot_duration_min),
        working_days: c.working_days,
        start_time: c.start_time, end_time: c.end_time,
        breaks: c.breaks,
        advance_booking_days: parseInt(c.advance_booking_days),
      };
      await api.patch("/clinic/me", body);
      toast.success("Saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <TopBar title={t("settings")} backTo="/clinic" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 ea-fade space-y-6">

        <section className="ea-card p-6 space-y-4">
          <div><label className="ea-label">{t("clinic")}</label><input data-testid="s-name" className="ea-input" value={c.name || ""} onChange={(e)=>set("name", e.target.value)} /></div>
          <div><label className="ea-label">{t("doctor")}</label><input data-testid="s-doctor" className="ea-input" value={c.doctor_name || ""} onChange={(e)=>set("doctor_name", e.target.value)} /></div>
          <div><label className="ea-label">{t("place")}</label><input data-testid="s-place" className="ea-input" value={c.place || ""} onChange={(e)=>set("place", e.target.value)} /></div>
          <div>
            <label className="ea-label">{t("whatsapp_number")}</label>
            <input data-testid="s-wa" className="ea-input" placeholder="+91 98765 43210" value={c.whatsapp_number || ""} onChange={(e)=>set("whatsapp_number", e.target.value)} />
            <p className="text-xs text-[#5A5850] mt-1">Used by patients' phones to send you a WhatsApp message directly. No automated sending.</p>
          </div>
        </section>

        <section className="ea-card p-6">
          <label className="ea-label">{t("working_days")}</label>
          <div className="flex flex-wrap gap-2">
            {DAY_KEYS.map((k, i) => (
              <button key={i} data-testid={`s-day-${i}`} onClick={()=>toggleDay(i)} type="button"
                className={"day-chip" + ((c.working_days || []).includes(i) ? " selected" : "")} style={{ minWidth: 72 }}>
                {t(k)}
              </button>
            ))}
          </div>
        </section>

        <section className="ea-card p-6 grid sm:grid-cols-3 gap-4">
          <div><label className="ea-label">{t("clinic_hours")} — Start</label><input type="time" data-testid="s-start" className="ea-input" value={c.start_time || "09:00"} onChange={(e)=>set("start_time", e.target.value)} /></div>
          <div><label className="ea-label">{t("clinic_hours")} — End</label><input type="time" data-testid="s-end" className="ea-input" value={c.end_time || "17:00"} onChange={(e)=>set("end_time", e.target.value)} /></div>
          <div>
            <label className="ea-label">{t("slot_duration")}</label>
            <select data-testid="s-slot-dur" className="ea-select" value={c.slot_duration_min || 15} onChange={(e)=>set("slot_duration_min", e.target.value)}>
              {[10,15,20,30].map((n)=>(<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="ea-label">{t("advance_days")}</label>
            <input type="number" min={1} max={180} data-testid="s-advance" className="ea-input" value={c.advance_booking_days || 45} onChange={(e)=>set("advance_booking_days", e.target.value)} />
          </div>
        </section>

        <section className="ea-card p-6">
          <div className="flex items-center justify-between mb-3">
            <label className="ea-label mb-0">{t("breaks")}</label>
            <button data-testid="s-add-break" type="button" onClick={addBreak} className="ea-btn ea-btn-secondary"><Plus size={16} /> +</button>
          </div>
          <div className="space-y-3">
            {(c.breaks || []).map((b, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`s-break-${i}`}>
                <input type="time" className="ea-input col-span-5" value={b.start} onChange={(e)=>setBreak(i, "start", e.target.value)} data-testid={`s-break-start-${i}`} />
                <span className="col-span-1 text-center">–</span>
                <input type="time" className="ea-input col-span-5" value={b.end} onChange={(e)=>setBreak(i, "end", e.target.value)} data-testid={`s-break-end-${i}`} />
                <button data-testid={`s-break-rm-${i}`} onClick={()=>rmBreak(i)} className="col-span-1 text-[#B2402A]"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>

        <button data-testid="s-save" onClick={save} className="ea-btn ea-btn-primary">{t("save")}</button>
      </main>
    </div>
  );
}
