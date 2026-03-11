import { useState, useEffect } from "react";
import { getSweepHistory, subscribe, SweepHistoryEntry } from "@/lib/sweepHistory";

export function useSweepHistory(): SweepHistoryEntry[] {
  const [entries, setEntries] = useState<SweepHistoryEntry[]>(getSweepHistory);
  useEffect(() => {
    setEntries(getSweepHistory());
    const unsub = subscribe(() => setEntries(getSweepHistory()));
    return unsub;
  }, []);
  return entries;
}
