import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { ContractCard } from "@/components/contract-card";
import type { Contract } from "@/lib/contracts";
import { searchContracts } from "@/lib/search";

type Props = {
  rows: Contract[];
  ready: boolean;
  today: string;
  onEdit: (row: Contract) => void;
  onDelete: (row: Contract) => void;
  onAck: (row: Contract) => void;
};

export function AllPage({ rows, ready, today, onEdit, onDelete, onAck }: Props) {
  const [query, setQuery] = useState("");
  // 最新录入的在最前
  const newest = useMemo(() => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [rows]);
  const shown = useMemo(() => searchContracts(newest, query), [newest, query]);
  const searching = query.trim().length > 0;

  return (
    <>
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">全部合同</h1>
        <p className="shrink-0 text-sm text-muted">{searching ? `${shown.length}/${rows.length}` : rows.length} 份</p>
      </header>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索公司、类型、日期、金额、备注"
          aria-label="搜索合同"
          className="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-10 text-base text-ink outline-none placeholder:text-muted focus:border-primary [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <button type="button" aria-label="清除搜索" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted">
            <X className="size-4" />
          </button>
        )}
      </div>

      {!ready ? (
        <p className="mt-4 text-sm text-muted">正在读取…</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-6 text-sm text-muted">{searching ? "没有找到相关合同" : "暂无"}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((row) => (
            <li key={row.id}>
              <ContractCard row={row} today={today} onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} onAck={() => onAck(row)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
