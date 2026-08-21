import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import LangToggle from "@/components/LangToggle";
import { useLang } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function PatientLogin() {
  const { t } = useLang();
  const { setToken } = useSession();
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [address, setAddress] = useState("");
  const [step, setStep] = useState(1); // 1=phone,2=otp+details
  const [demoOtp, setDemoOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    if (!phone.trim()) return toast.error(t("mobile_number"));
    setBusy(true);
    try {
      const { data } = await api.post("/auth/patient/request-otp", { phone });
      setDemoOtp(data.demo_otp);
      setStep(2);
      toast.success(t("otp_sent"));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (!otp.trim()) return toast.error(t("otp"));
    setBusy(true);
    try {
      const { data } = await api.post("/auth/patient/verify-otp", { phone, code: otp, name, place, address });
      setToken(data.token, "patient", data.patient);
      nav("/patient");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <header className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="ea-btn ea-btn-secondary" data-testid="patient-login-back" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
          <ArrowLeft size={18} /> {t("back")}
        </Link>
        <LangToggle />
      </header>
      <main className="max-w-md mx-auto px-4 pb-16 ea-fade">
        <h1 className="font-bold text-3xl mb-2">{t("patient")}</h1>
        <p className="text-[#5A5850] mb-8">{t("patient_sub")}</p>

        {step === 1 && (
          <div className="ea-card p-6 space-y-5">
            <div>
              <label className="ea-label">{t("mobile_number")}</label>
              <input data-testid="patient-phone" type="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={(e)=>setPhone(e.target.value)} className="ea-input" />
            </div>
            <button data-testid="patient-request-otp" disabled={busy} onClick={requestOtp} className="ea-btn ea-btn-primary w-full">
              {busy ? "…" : t("send_otp")}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="ea-card p-6 space-y-5">
            {demoOtp && (
              <div className="rounded-xl bg-[#FFF4D6] border-2 border-[#E8B23A] p-3 text-[#6B4A00] font-semibold" data-testid="patient-demo-otp">
                {t("demo_otp_note")}<span className="text-xl">{demoOtp}</span>
              </div>
            )}
            <div>
              <label className="ea-label">{t("otp")}</label>
              <input data-testid="patient-otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e)=>setOtp(e.target.value)} className="ea-input" />
            </div>
            <div>
              <label className="ea-label">{t("name")}</label>
              <input data-testid="patient-name" value={name} onChange={(e)=>setName(e.target.value)} className="ea-input" />
            </div>
            <div>
              <label className="ea-label">{t("place")}</label>
              <input data-testid="patient-place" value={place} onChange={(e)=>setPlace(e.target.value)} className="ea-input" />
            </div>
            <div>
              <label className="ea-label">{t("address")}</label>
              <textarea data-testid="patient-address" rows={2} value={address} onChange={(e)=>setAddress(e.target.value)} className="ea-input" />
            </div>
            <button data-testid="patient-verify" disabled={busy} onClick={verify} className="ea-btn ea-btn-primary w-full">
              {busy ? "…" : t("verify")}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
