import { useState, useCallback } from "react";

export type ExecutionDrilldownFilter =
  | {
      type: "playbook";
      playbookId: string;
      label: string;
    }
  | {
      type: "mistake";
      mistakeId: string;
      label: string;
    }
  | {
      type: "delta";
      deltaStatus: string;
      label: string;
    }
  | {
      type: "quality";
      quality: string;
      label: string;
    }
  | {
      type: "risk";
      riskKey: string;
      label: string;
    }
  | null;

const DRILLDOWN_STATE_KEY = "reports_drilldown_filter";

function loadDrilldownFromStorage(): ExecutionDrilldownFilter {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(DRILLDOWN_STATE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed as ExecutionDrilldownFilter;
  } catch {
    return null;
  }
}

function saveDrilldownToStorage(filter: ExecutionDrilldownFilter): void {
  if (typeof window === "undefined") return;
  try {
    if (filter === null) {
      localStorage.removeItem(DRILLDOWN_STATE_KEY);
    } else {
      localStorage.setItem(DRILLDOWN_STATE_KEY, JSON.stringify(filter));
    }
  } catch {
    // Ignore storage errors
  }
}

export function useReportsDrilldown() {
  const [activeFilter, setActiveFilterState] = useState<ExecutionDrilldownFilter>(() =>
    loadDrilldownFromStorage()
  );

  const setDrilldownFilter = useCallback((filter: ExecutionDrilldownFilter) => {
    setActiveFilterState(filter);
    saveDrilldownToStorage(filter);
  }, []);

  const clearDrilldownFilter = useCallback(() => {
    setActiveFilterState(null);
    saveDrilldownToStorage(null);
  }, []);

  return {
    activeFilter,
    setDrilldownFilter,
    clearDrilldownFilter,
    targetTab: "execution" as const,
  };
}
