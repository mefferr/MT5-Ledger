"use client"

import { StatementProvider, useStatement } from "@/lib/store"
import { UploadHero } from "@/components/upload-hero"
import { DashboardShell } from "@/components/dashboard-shell"

function AppRouter() {
  const { statement } = useStatement()
  if (!statement) return <UploadHero />
  return <DashboardShell />
}

export default function Page() {
  return (
    <StatementProvider>
      <AppRouter />
    </StatementProvider>
  )
}
