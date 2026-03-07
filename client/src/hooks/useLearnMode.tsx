import { createContext, useContext, useState, ReactNode } from "react";

interface LearnModeContextType {
  learnMode: boolean;
  toggleLearnMode: () => void;
}

const LearnModeContext = createContext<LearnModeContextType>({ learnMode: false, toggleLearnMode: () => {} });

export function LearnModeProvider({ children }: { children: ReactNode }) {
  const [learnMode, setLearnMode] = useState(false);
  return (
    <LearnModeContext.Provider value={{ learnMode, toggleLearnMode: () => setLearnMode(v => !v) }}>
      {children}
    </LearnModeContext.Provider>
  );
}

export function useLearnMode() {
  return useContext(LearnModeContext);
}
