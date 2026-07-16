import { Mt5Tab } from "@/components/tabs/mt5-tab"
import { Terminal } from "lucide-react"

export default function Mt5StandalonePage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="flex items-center gap-3 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <Terminal className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold">Ledger</span>
          <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Live MT5 Manager
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-6">
        <Mt5Tab />
      </main>
    </div>
  )
}
