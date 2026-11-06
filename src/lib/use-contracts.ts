import { useCallback, useEffect, useRef, useState } from "react";
import { loadContracts, saveContracts, type Contract } from "@/lib/contracts";
import { syncReminders, type RemindState } from "@/lib/native";

/** 合同列表 + 本地保存 + 系统提醒同步，界面只管显示。 */
export function useContracts() {
  const [rows, setRows] = useState<Contract[]>([]);
  const [ready, setReady] = useState(false);
  const [storageWarn, setStorageWarn] = useState(false);
  const [remind, setRemind] = useState<RemindState | null>(null);
  const askRef = useRef(false);

  useEffect(() => {
    setRows(loadContracts());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) setStorageWarn(!saveContracts(rows));
  }, [rows, ready]);

  useEffect(() => {
    if (!ready) return;
    const ask = askRef.current;
    askRef.current = false;
    void syncReminders(rows, ask).then(setRemind);
  }, [rows, ready]);

  const add = useCallback((row: Contract) => {
    askRef.current = true;
    setRows((current) => [row, ...current]);
  }, []);
  const patch = useCallback((id: string, change: (row: Contract) => Contract) => {
    setRows((current) => current.map((row) => (row.id === id ? change(row) : row)));
  }, []);
  const remove = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  }, []);
  const merge = useCallback(
    (incoming: Contract[]) => {
      const known = new Set(rows.map((row) => row.id));
      const fresh = incoming.filter((row) => !known.has(row.id));
      if (fresh.length > 0) setRows((current) => [...fresh, ...current]);
      return { added: fresh.length, skipped: incoming.length - fresh.length };
    },
    [rows],
  );
  const askPermission = useCallback(async () => setRemind(await syncReminders(rows, true)), [rows]);

  return { rows, ready, storageWarn, remind, add, patch, remove, merge, askPermission };
}
