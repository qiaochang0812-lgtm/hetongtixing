import { formatCN, type Contract } from "@/lib/contracts";

function haystack(row: Contract): string {
  return [
    row.customer,
    row.title,
    row.signedOn,
    row.expiresOn,
    formatCN(row.signedOn),
    formatCN(row.expiresOn),
    row.amount,
    row.notes,
    row.raw,
  ]
    .join("\n")
    .toLowerCase();
}

/** 空格分隔的多个关键词需要同时命中；公司、类型、日期（2026-12 / 2026年12月 都行）、金额、备注都能搜。 */
export function searchContracts(rows: Contract[], query: string): Contract[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((row) => {
    const text = haystack(row);
    return words.every((word) => text.includes(word));
  });
}
