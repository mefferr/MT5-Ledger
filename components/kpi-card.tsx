import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
  tone?: "default" | "profit" | "loss" | "accent"
  delta?: string
  deltaTone?: "profit" | "loss" | "neutral"
}

export function KpiCard({ label, value, hint, icon: Icon, tone = "default", delta, deltaTone }: KpiCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div
            className={cn(
              "mt-1.5 truncate font-mono text-2xl font-semibold tnum tracking-tight",
              tone === "profit" && "text-primary",
              tone === "loss" && "text-destructive",
              tone === "accent" && "text-accent",
            )}
            title={value}
          >
            {value}
          </div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          {delta && (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[11px] font-medium tnum",
                deltaTone === "profit" && "border-primary/40 text-primary",
                deltaTone === "loss" && "border-destructive/40 text-destructive",
                deltaTone === "neutral" && "text-muted-foreground",
              )}
            >
              {delta}
            </div>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1",
              tone === "profit" && "bg-primary/10 text-primary ring-primary/30",
              tone === "loss" && "bg-destructive/10 text-destructive ring-destructive/30",
              tone === "accent" && "bg-accent/10 text-accent ring-accent/30",
              tone === "default" && "bg-muted text-muted-foreground ring-border",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  )
}
