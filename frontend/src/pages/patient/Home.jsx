import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "@/components/TopBar";
import { useLang } from "@/lib/i18n";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { CalendarClock, MapPin } from "lucide-react";

export default function PatientHome() {
  const { t } = useLang();
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/clinics");
        setClinics(data);
      } catch (e) { toast.error(formatApiError(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <TopBar title={t("select_doctor")} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 ea-fade">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[#5A5850]">{t("select_doctor")}</p>
          <Link to="/patient/my-bookings" data-testid="my-bookings-link" className="ea-btn ea-btn-secondary">
            <CalendarClock size={18} /> {t("my_bookings")}
          </Link>
        </div>
        {loading && <p className="text-[#5A5850]">…</p>}
        {!loading && clinics.length === 0 && <p className="text-[#5A5850]" data-testid="clinics-empty">No clinics yet</p>}
        <div className="grid gap-3">
          {clinics.map((c) => (
            <Link key={c.id} to={`/patient/book/${c.id}`} data-testid={`clinic-${c.id}`} className="ea-card p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform">
              <div className="rounded-2xl bg-[#E5F3EA] text-[#157F3B] p-3">
                <MapPin size={26} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg">{c.name}</p>
                <p className="text-[#5A5850]">{c.doctor_name}</p>
                <p className="text-sm text-[#5A5850]">{c.place}</p>
              </div>
              <span className="text-2xl text-[#5A5850]">›</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
