import { Link, useNavigate } from "react-router-dom";
import LangToggle from "@/components/LangToggle";
import { useLang } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { LogOut, ArrowLeft } from "lucide-react";

export default function TopBar({ title, backTo, showLogout = true }) {
  const { t } = useLang();
  const { session, logout } = useSession();
  const nav = useNavigate();
  const onLogout = () => {
    logout();
    const map = { patient: "/patient/login", clinic: "/clinic/login", admin: "/admin/login" };
    nav(map[session?.role] || "/");
  };
  return (
    <header className="sticky top-0 z-30 bg-[#F8F5EF]/85 backdrop-blur-md border-b border-[#E1DBCB]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {backTo && (
            <Link to={backTo} data-testid="topbar-back" className="ea-btn ea-btn-secondary" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
              <ArrowLeft size={18} />
            </Link>
          )}
          <div className="min-w-0">
            <p className="font-bold text-lg sm:text-xl truncate" data-testid="topbar-title">{title || t("app_name")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle />
          {showLogout && session && (
            <button data-testid="topbar-logout" onClick={onLogout} className="ea-btn ea-btn-secondary" style={{ minHeight: 44, padding: "0.5rem 0.85rem" }}>
              <LogOut size={18} />
              <span className="hidden sm:inline">{t("logout")}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
