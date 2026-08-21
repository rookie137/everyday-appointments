import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import TopBar from "@/components/TopBar";
import { useLang, buildWhatsappMessage } from "@/lib/i18n";
import { api, formatApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function PatientReceipt() {
  const { t } = useLang();
  const { session } = useSession();
  const { appointmentId } = useParams();
  const [appt, setAppt] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/patient/appointments");
        const a = data.find((x) => x.id === appointmentId);
        if (!a) toast.error("Not found");
        setAppt(a);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [appointmentId]);

  if (!appt) return <div className="min-h-screen bg-[#F8F5EF]"><TopBar backTo="/patient" /><p className="p-8 text-[#5A5850]">…</p></div>;

  const wa = appt.clinic?.whatsapp_number?.replace(/\D/g, "") || "";
  const message = buildWhatsappMessage(t, {
    clinicName: appt.clinic?.name,
    doctorName: appt.clinic?.doctor_name,
    place: appt.clinic?.place,
    date: appt.date,
    time: appt.slot_time,
    token: appt.token_number,
    patientName: session?.user?.name || "",
    patientPlace: session?.user?.place || "",
  });
  const waUrl = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(message)}` : "";

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <TopBar title={t("booking_confirmed")} backTo="/patient" />
      <main className="max-w-md mx-auto px-4 sm:px-6 py-8 ea-fade">
        <div className="ea-card p-6 text-center">
          <CheckCircle2 className="mx-auto mb-4 text-[#157F3B]" size={56} />
          <p className="text-[#5A5850] mb-1">{t("booking_confirmed")}</p>
          <p className="font-bold text-3xl mb-1" data-testid="receipt-token">{t("token")} #{appt.token_number}</p>
          <p className="text-2xl font-bold text-[#157F3B]">{appt.slot_time}</p>
          <p className="text-[#5A5850] mt-3">{appt.date}</p>
          <div className="mt-5 border-t border-[#E1DBCB] pt-4 text-left">
            <p><span className="text-[#5A5850]">{t("doctor")}:</span> <span className="font-semibold">{appt.clinic?.doctor_name}</span></p>
            <p><span className="text-[#5A5850]">{t("clinic")}:</span> <span className="font-semibold">{appt.clinic?.name}</span></p>
            <p className="text-[#5A5850]">{appt.clinic?.place}</p>
          </div>

          {waUrl ? (
            <a data-testid="wa-token-btn" href={waUrl} target="_blank" rel="noopener noreferrer" className="ea-btn ea-btn-wa w-full mt-6">
              {t("get_token_wa")}
            </a>
          ) : (
            <p className="text-sm text-[#B2402A] mt-6">Clinic has no WhatsApp number on file.</p>
          )}

          <Link to="/patient/my-bookings" className="ea-btn ea-btn-secondary w-full mt-3" data-testid="go-my-bookings">
            {t("my_bookings")}
          </Link>
        </div>
      </main>
    </div>
  );
}
