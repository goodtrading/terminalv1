import React from "react";
import { cn } from "@/lib/utils";

interface TerminalPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: React.ReactNode;
  noPadding?: boolean;
}

export function TerminalPanel({ title, children, className, noPadding = false, ...props }: TerminalPanelProps) {
  return (
    <div 
      className={cn(
        "flex flex-col bg-terminal-panel border border-terminal-border overflow-hidden",
        className
      )} 
      {...props}
    >
      {title && (
        <div className="px-3 py-1.5 bg-terminal-bg border-b border-terminal-border text-xs font-semibold tracking-wider text-terminal-muted flex-shrink-0">
          {title}
        </div>
      )}
      <div className={cn("flex-1 overflow-auto", !noPadding && "p-3")}>
        {children}
      </div>
    </div>
  );
}

export function TerminalValue({ 
  label, 
  value, 
  trend 
}: { 
  label: string; 
  value: React.ReactNode;
  trend?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-terminal-border/50 last:border-0">
      <span className="text-xs text-terminal-muted">{label}</span>
      <span className={cn(
        "text-sm font-mono font-medium",
        trend === "positive" ? "text-terminal-positive" : 
        trend === "negative" ? "text-terminal-negative" : 
        "text-terminal-text"
      )}>
        {value}
      </span>
    </div>
  );
}
