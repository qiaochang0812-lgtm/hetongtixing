import { Bell, FileText, Settings } from "lucide-react";

export type Tab = "home" | "all" | "settings";

const TABS = [
  { id: "home", label: "首页", Icon: Bell },
  { id: "all", label: "全部合同", Icon: FileText },
  { id: "settings", label: "设置", Icon: Settings },
] as const;

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-3">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(id)}
                className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-semibold text-primary" : "text-muted"}`}
              >
                <Icon className={`size-5 ${active ? "stroke-[2.4]" : ""}`} />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
