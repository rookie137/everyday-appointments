import { useLang } from "@/lib/i18n";
import { Globe2 } from "lucide-react";

export default function LangToggle({ className = "" }) {
  const { lang, toggle } = useLang();
  return (
    <button
      data-testid="lang-toggle"
      onClick={toggle}
      className={"inline-flex items-center gap-2 px-3 py-2 rounded-full border-2 border-[#E1DBCB] bg-white hover:bg-[#F1EBDD] text-[#1F1D18] font-semibold text-sm " + className}
      aria-label="Toggle language"
    >
      <Globe2 size={16} />
      <span className={lang === "ml" ? "font-bold" : "opacity-60"}>മലയാളം</span>
      <span className="opacity-40">|</span>
      <span className={lang === "en" ? "font-bold" : "opacity-60"}>English</span>
    </button>
  );
}
