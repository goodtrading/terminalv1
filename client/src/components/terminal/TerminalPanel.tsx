import React from "react";
import { cn } from "@/lib/utils";

interface TerminalPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: React.ReactNode;
  noPadding?: boolean;
  headerExtra?: React.ReactNode;
}

export function TerminalPanel({ title, children, className, noPadding = false, headerExtra, ...props }: TerminalPanelProps) {
  return (
    <div 
      className={cn(
        "flex flex-col bg-terminal-panel border border-terminal-border overflow-hidden",
        className
      )} 
      {...props}
    >
      {title && (
        <div className="px-3 py-1.5 bg-terminal-panel border-b border-terminal-border flex justify-between items-center shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] terminal-text-primary">
            {title}
          </span>
          <div className="flex items-center space-x-2">
            {headerExtra}
            <div className="flex space-x-1">
              <div className="w-1 h-1 rounded-full bg-terminal-border"></div>
              <div className="w-1 h-1 rounded-full bg-terminal-border"></div>
            </div>
          </div>
        </div>
      )}
      <div className={cn("flex-1 overflow-hidden flex flex-col", !noPadding && "p-4 overflow-auto")}>
        {children}
      </div>
    </div>
  );
}

export function TerminalValue({ 
  label, 
  value, 
  trend,
  isBadge = false
}: { 
  label: string; 
  value: React.ReactNode;
  trend?: "positive" | "negative" | "neutral";
  isBadge?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03] last:border-0 group">
      <span className="terminal-text-label text-[10px] transition-colors">{label}</span>
      {isBadge ? (
        <span className={cn(
          "terminal-badge",
          trend === "positive" ? "terminal-badge-success" : 
          trend === "negative" ? "terminal-badge-error" : 
          "bg-terminal-border terminal-text-primary"
        )}>
          {value}
        </span>
      ) : (
        <span className={cn(
          "text-xs font-mono font-bold",
          trend === "positive" ? "text-terminal-positive" : 
          trend === "negative" ? "text-terminal-negative" : 
          "terminal-text-primary"
        )}>
          {value}
        </span>
      )}
    </div>
  );
}
