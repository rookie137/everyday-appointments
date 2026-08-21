import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import LangToggle from "@/components/LangToggle";
import { useLang } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function ClinicLogin() {
  const { t } = useLang();
  const { setToken } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);
  const [demoOtp, setDemoOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    if (!email.trim()) return toast.error(t("email"));
    setBusy(true);
    try {
      const { data } = await api.post("/auth/clinic/request-otp", { email });
      setDemoOtp(data.demo_otp);
      setStep(2);
      toast.success(t("otp_sent"));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/clinic/verify-otp", { email, code: otp });
      setToken(data.token, "clinic", data.clinic);
      nav("/clinic");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <header className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="ea-btn ea-btn-secondary" data-testid="clinic-login-back" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
          <ArrowLeft size={18} /> {t("back")}
        </Link>
        <LangToggle />
      </header>
      <main className="max-w-md mx-auto px-4 pb-16 ea-fade">
        <h1 className="font-bold text-3xl mb-2">{t("clinic")}</h1>
        <p className="text-[#5A5850] mb-8">{t("clinic_sub")}</p>

        {step === 1 && (
          <div className="ea-card p-6 space-y-5">
            <div>
              <label className="ea-label">{t("email")}</label>
              <input data-testid="clinic-email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="ea-input" placeholder="demo@clinic.example.com" />
            </div>
            <button data-testid="clinic-request-otp" disabled={busy} onClick={requestOtp} className="ea-btn ea-btn-primary w-full">
              {busy ? "…" : t("send_otp")}
            </button>
          </div>
        )}
        {step === 2 && (
          <div className="ea-card p-6 space-y-5">
            {demoOtp && (
              <div className="rounded-xl bg-[#FFF4D6] border-2 border-[#E8B23A] p-3 text-[#6B4A00] font-semibold" data-testid="clinic-demo-otp">
                {t("demo_otp_note")}<span className="text-xl">{demoOtp}</span>
              </div>
            )}
            <div>
              <label className="ea-label">{t("otp")}</label>
              <input data-testid="clinic-otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e)=>setOtp(e.target.value)} className="ea-input" />
            </div>
            <button data-testid="clinic-verify" disabled={busy} onClick={verify} className="ea-btn ea-btn-primary w-full">
              {busy ? "…" : t("verify")}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
