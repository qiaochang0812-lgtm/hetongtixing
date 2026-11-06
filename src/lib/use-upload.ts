import { useCallback, useRef, useState } from "react";
import type { Progress } from "@/lib/async";
import { parseContractDocument } from "@/lib/contract-doc";
import type { Draft } from "@/lib/contracts";
import { extractFileText } from "@/lib/file-text";
import { closeOcr } from "@/lib/ocr";

export type Job = { percent: number; label: string; startedAt: number };

/** 上传合同：读取 → 识别 → 提取，带进度和取消。切换页面不会中断。 */
export function useUpload(onDraft: (draft: Draft) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [note, setNote] = useState("");
  const run = useRef(0);

  const start = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const id = ++run.current;
      const live = () => run.current === id;
      setNote("");
      setJob({ percent: 2, label: "正在读取文件…", startedAt: Date.now() });
      const progress: Progress = (percent, label) => {
        if (!live()) return;
        setJob((current) => (current ? { ...current, percent: Math.max(current.percent, Math.min(99, percent)), label } : current));
      };
      try {
        const { draft, found } = parseContractDocument(await extractFileText(file, progress));
        if (!live()) return;
        if (found === 0) setNote("读到了文字，但没找到日期、金额等信息，请手动录入。");
        else onDraft(draft);
      } catch (error) {
        if (live()) setNote(error instanceof Error && error.message ? error.message : "这份合同没能读取，请换一份或手动录入。");
      } finally {
        if (live()) setJob(null);
      }
    },
    [onDraft],
  );

  const cancel = useCallback(() => {
    run.current += 1;
    setJob(null);
    closeOcr();
  }, []);

  return { job, note, start, cancel };
}
