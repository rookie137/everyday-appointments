import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import LangToggle from "@/components/LangToggle";
import { useLang } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function AdminLogin() {
  const { t } = useLang();
  const { setToken } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/admin/login", { email, password });
      setToken(data.token, "admin", data.admin);
      nav("/admin");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EF]">
      <header className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="ea-btn ea-btn-secondary" data-testid="admin-login-back" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
          <ArrowLeft size={18} /> {t("back")}
        </Link>
        <LangToggle />
      </header>
      <main className="max-w-md mx-auto px-4 pb-16 ea-fade">
        <h1 className="font-bold text-3xl mb-2">{t("admin")}</h1>
        <p className="text-[#5A5850] mb-8">{t("admin_sub")}</p>
        <form onSubmit={submit} className="ea-card p-6 space-y-5">
          <div><label className="ea-label">{t("email")}</label><input data-testid="admin-email" type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="ea-input" /></div>
          <div><label className="ea-label">{t("password")}</label><input data-testid="admin-password" type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} className="ea-input" /></div>
          <button data-testid="admin-submit" disabled={busy} className="ea-btn ea-btn-primary w-full">{busy ? "…" : t("login")}</button>
        </form>
      </main>
    </div>
  );
}
