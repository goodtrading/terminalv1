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
        "flex flex-col bg-terminal-panel border border-terminal-border overflow-hidden terminal-panel-shadow",
        className
      )} 
      {...props}
    >
      {title && (
        <div className="px-3 py-1.5 bg-terminal-panel border-b border-terminal-border flex justify-between items-center shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/90">
            {title}
          </span>
          <div className="flex space-x-1">
            <div className="w-1 h-1 rounded-full bg-terminal-border"></div>
            <div className="w-1 h-1 rounded-full bg-terminal-border"></div>
          </div>
        </div>
      )}
      <div className={cn("flex-1 overflow-auto", !noPadding && "p-4")}>
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
      <span className="text-[10px] uppercase tracking-wider text-terminal-muted group-hover:text-white/60 transition-colors">{label}</span>
      {isBadge ? (
        <span className={cn(
          "px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-tight uppercase",
          trend === "positive" ? "bg-terminal-positive/10 text-terminal-positive border border-terminal-positive/20" : 
          trend === "negative" ? "bg-terminal-negative/10 text-terminal-negative border border-terminal-negative/20" : 
          "bg-terminal-border text-terminal-text"
        )}>
          {value}
        </span>
      ) : (
        <span className={cn(
          "text-xs font-mono font-bold",
          trend === "positive" ? "text-terminal-positive" : 
          trend === "negative" ? "text-terminal-negative" : 
          "text-white"
        )}>
          {value}
        </span>
      )}
    </div>
  );
}
