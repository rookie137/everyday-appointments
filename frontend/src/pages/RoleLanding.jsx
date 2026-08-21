import { Link } from "react-router-dom";
import LangToggle from "@/components/LangToggle";
import { useLang } from "@/lib/i18n";
import { User, Stethoscope, ShieldCheck } from "lucide-react";

export default function RoleLanding() {
  const { t } = useLang();
  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <header className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <p className="font-bold text-xl sm:text-2xl">{t("app_name")}</p>
        <LangToggle />
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 ea-fade">
        <p className="text-[#5A5850] text-lg">{t("tagline")}</p>
        <h1 className="font-bold text-3xl sm:text-4xl mt-3 mb-8">{t("who_are_you")}</h1>

        <div className="grid gap-4">
          <RoleCard to="/patient/login" testId="role-patient" title={t("patient")} sub={t("patient_sub")} color="#157F3B" bg="#E5F3EA" Icon={User} />
          <RoleCard to="/clinic/login" testId="role-clinic" title={t("clinic")} sub={t("clinic_sub")} color="#B2402A" bg="#FBE8E4" Icon={Stethoscope} />
          <RoleCard to="/admin/login" testId="role-admin" title={t("admin")} sub={t("admin_sub")} color="#6B4A00" bg="#FFF4D6" Icon={ShieldCheck} />
        </div>

        <p className="mt-10 text-sm text-[#5A5850]">
          Kerala • Rural clinics • WhatsApp-first · No app to install.
        </p>
      </main>
    </div>
  );
}

function RoleCard({ to, title, sub, color, bg, Icon, testId }) {
  return (
    <Link to={to} data-testid={testId} className="ea-card p-5 sm:p-6 flex items-center gap-4 hover:-translate-y-0.5 transition-transform">
      <div className="rounded-2xl p-3 sm:p-4" style={{ background: bg, color }}>
        <Icon size={30} />
      </div>
      <div className="flex-1">
        <p className="font-bold text-xl">{title}</p>
        <p className="text-[#5A5850]">{sub}</p>
      </div>
      <span className="text-2xl text-[#5A5850]">›</span>
    </Link>
  );
}
