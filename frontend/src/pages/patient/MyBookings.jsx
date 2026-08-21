import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import { useLang } from "@/lib/i18n";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { X } from "lucide-react";

export default function PatientMyBookings() {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/patient/appointments");
      setItems(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!window.confirm(t("cancel") + "?")) return;
    try {
      await api.post(`/patient/appointments/${id}/cancel`);
      toast.success("Cancelled");
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((a) => a.status !== "cancelled" && a.date >= today);
  const past = items.filter((a) => a.status === "cancelled" || a.date < today);

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <TopBar title={t("my_bookings")} backTo="/patient" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 ea-fade">
        <Section title={t("upcoming")} items={upcoming} onCancel={cancel} t={t} kind="upcoming" loading={loading} />
        <div className="h-8" />
        <Section title={t("past")} items={past} onCancel={null} t={t} kind="past" loading={loading} />
      </main>
    </div>
  );
}

function Section({ title, items, onCancel, t, kind, loading }) {
  return (
    <section>
      <h2 className="font-bold text-2xl mb-3">{title}</h2>
      {loading && <p className="text-[#5A5850]">…</p>}
      {!loading && items.length === 0 && <div className="ea-card p-6 text-[#5A5850]" data-testid={`empty-${kind}`}>{t("no_bookings")}</div>}
      <div className="grid gap-3">
        {items.map((a, idx) => (
          <div key={a.id} data-testid={`booking-${kind}-${idx}`} className="ea-card p-4 sm:p-5 flex items-center gap-3">
            <div className="rounded-2xl bg-[#FFF4D6] text-[#6B4A00] px-3 py-2 text-center min-w-[70px]">
              <div className="text-xs">{t("token")}</div>
              <div className="font-bold text-xl">#{a.token_number}</div>
            </div>
            <div className="flex-1">
              <p className="font-bold">{a.clinic?.name}</p>
              <p className="text-[#5A5850] text-sm">{a.date} · {a.slot_time}</p>
              <span className={"status-pill mt-1 " + statusClass(a.status)}>{t(mapStatusKey(a.status))}</span>
            </div>
            {onCancel && a.status !== "cancelled" && (
              <button data-testid={`cancel-${idx}`} onClick={() => onCancel(a.id)} className="ea-btn ea-btn-secondary" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
                <X size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function mapStatusKey(s) {
  return { waiting: "waiting", in_consultation: "in_consult", completed: "completed", no_show: "no_show", cancelled: "cancelled" }[s] || s;
}
function statusClass(s) {
  return { waiting: "pill-waiting", in_consultation: "pill-in", completed: "pill-done", no_show: "pill-noshow", cancelled: "pill-cancel" }[s] || "pill-done";
}
