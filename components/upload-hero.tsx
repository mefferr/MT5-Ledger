"use client"

import { useCallback, useRef, useState } from "react"
import { useStatement } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  FileUp,
  Flame,
  LineChart,
  Sparkles,
  UploadCloud,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"

export function UploadHero() {
  const { loadFromHtml, loadFromMt5, loadDemo, loading, error } = useStatement()
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? "")
        loadFromHtml(text)
      }
      reader.readAsText(file)
    },
    [loadFromHtml],
  )

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* Grid background */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />

      <header className="relative z-10 flex items-center justify-between border-b border-border/60 bg-background/60 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <LineChart className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold tracking-tight">Ledger</span>
          <span className="ml-2 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Beta
          </span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a className="hover:text-foreground" href="#features">
            Features
          </a>
          <a className="hover:text-foreground" href="#how">
            How it works
          </a>
          <a className="hover:text-foreground" href="#supported">
            Supported formats
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadFromMt5(30)} disabled={loading}>
            <Activity className="mr-2 h-3.5 w-3.5" />
            Sync MT5
          </Button>
          <Button variant="outline" size="sm" onClick={loadDemo} disabled={loading}>
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Load Demo
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            MetaTrader 4 &amp; 5 HTML statements supported
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Turn your broker statement into a{" "}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              performance cockpit
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-muted-foreground md:text-lg">
            Upload one file and unlock equity curves, drawdowns, calendar heatmaps, session analysis,
            risk metrics and 8+ deep analytics tabs — all rendered locally in your browser.
          </p>

          <div className="mt-10">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                const f = e.dataTransfer.files?.[0]
                if (f) handleFile(f)
              }}
              className={cn(
                "group relative mx-auto flex max-w-2xl cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-8 py-12 backdrop-blur transition-colors",
                drag && "border-primary/60 bg-primary/5",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".htm,.html,text/html"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
                <UploadCloud className="h-5 w-5 text-primary" />
              </div>
              <div className="text-center">
                <div className="font-medium">Drop your statement here</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  or{" "}
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => inputRef.current?.click()}
                  >
                    browse files
                  </button>{" "}
                  — <span className="tnum">.htm</span> / <span className="tnum">.html</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-md border border-border bg-background px-2 py-1">100% local</span>
                <span className="rounded-md border border-border bg-background px-2 py-1">No uploads</span>
                <span className="rounded-md border border-border bg-background px-2 py-1">No account</span>
              </div>
            </label>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" className="w-full sm:w-auto" onClick={() => inputRef.current?.click()} disabled={loading}>
                <FileUp className="mr-2 h-4 w-4" />
                Select file
              </Button>
              <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={() => loadFromMt5(30)} disabled={loading}>
                <Activity className="mr-2 h-4 w-4" />
                Sync Live MT5 Data
              </Button>
              <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={loadDemo} disabled={loading}>
                Use Sample Data
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>
        </div>

        {/* Feature preview grid */}
        <section id="features" className="mt-24 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              icon: LineChart,
              title: "Equity & drawdown",
              body: "Cumulative P/L, underwater curve, peak/trough markers and recovery factor.",
            },
            {
              icon: CalendarDays,
              title: "Monthly calendar",
              body: "Heatmapped daily P/L, trade counts and streaks across every month you traded.",
            },
            {
              icon: BarChart3,
              title: "Distribution analytics",
              body: "Hour-of-day, day-of-week, session, symbol, buy vs sell and duration breakdowns.",
            },
            {
              icon: Activity,
              title: "Risk metrics",
              body: "Sharpe, Sortino, profit factor, expectancy, payoff ratio, Kelly %, R multiples.",
            },
            {
              icon: Flame,
              title: "Streaks & patterns",
              body: "Longest win/loss streaks, rolling win rate and behavioural trade patterns.",
            },
            {
              icon: Layers,
              title: "Full trade ledger",
              body: "Sortable, filterable table with every trade, SL/TP, duration, R and net P/L.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-xl border border-border bg-card/60 p-5 backdrop-blur transition-colors hover:border-primary/40"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="font-medium">{f.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <section id="how" className="mt-20 rounded-xl border border-border bg-card/60 p-8 backdrop-blur">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              { step: "01", title: "Export from MT4/MT5", body: "In your terminal: right-click Account History → Save as Detailed Report." },
              { step: "02", title: "Drop the .htm file", body: "Everything is parsed in your browser. Your trades never leave this tab." },
              { step: "03", title: "Dive into 9 tabs", body: "Overview, trades, calendar, performance, analytics, symbols, sessions, risk, streaks." },
            ].map((s) => (
              <div key={s.step}>
                <div className="font-mono text-xs text-muted-foreground">{s.step}</div>
                <div className="mt-2 text-lg font-medium">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 px-6 py-6 text-center text-xs text-muted-foreground">
        Ledger · Local-first trade analytics · Built with React, Recharts &amp; shadcn/ui
      </footer>
    </div>
  )
}
