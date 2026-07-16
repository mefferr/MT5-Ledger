"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Terminal, Shield, Zap } from "lucide-react"

export function SetupWizard() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  
  const [tokens, setTokens] = useState({
    telegramToken: "",
    ngrokToken: "",
    chatID: ""
  })

  useEffect(() => {
    // Check if user has skipped before
    if (localStorage.getItem("skip_setup") === "true") return

    // Check if server already has tokens
    fetch("/api/setup")
      .then(res => res.json())
      .then(data => {
        if (!data.isSetup) {
          setOpen(true)
        }
      })
      .catch(console.error)
  }, [])

  const handleSkip = () => {
    localStorage.setItem("skip_setup", "true")
    setOpen(false)
  }

  const handleSave = async () => {
    if (!tokens.telegramToken) return
    setLoading(true)
    
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokens)
      })
      
      if (res.ok) {
        setDone(true)
        localStorage.setItem("skip_setup", "true") // don't show again
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2 text-primary">
              <Zap className="h-5 w-5" /> All Set!
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-4">
              Your tokens have been securely saved to the <code className="text-xs bg-muted p-1 rounded">.env</code> file.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 my-4">
            <p className="text-sm font-medium text-primary">⚠️ Restart Required</p>
            <p className="text-xs text-muted-foreground mt-1">
              To apply these changes and start the Python bridge, please kill this terminal process (Ctrl+C) and run <strong>npm run dev</strong> again.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setOpen(false)} variant="outline">I understand</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      // Prevent clicking outside to close
      if (val) setOpen(true)
    }}>
      <DialogContent className="sm:max-w-lg bg-card border-border" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Terminal className="h-6 w-6 text-primary" />
            Initialize MT5 Ledger
          </DialogTitle>
          <DialogDescription className="text-muted-foreground pt-2">
            Welcome to the local-first MT5 dashboard. If you want to enable the live Python bridge and Telegram remote-control bot, enter your tokens below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="tg" className="text-foreground font-medium">Telegram Bot Token <span className="text-destructive">*</span></Label>
            <Input 
              id="tg" 
              placeholder="e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" 
              value={tokens.telegramToken}
              onChange={e => setTokens({...tokens, telegramToken: e.target.value})}
              className="font-mono text-sm bg-muted/50"
            />
            <p className="text-xs text-muted-foreground">Get this from @BotFather on Telegram.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ngrok" className="text-foreground font-medium">Ngrok Auth Token <span className="text-muted-foreground font-normal">(Optional, for Mini App)</span></Label>
            <Input 
              id="ngrok" 
              placeholder="e.g. 2Yg7... (from your ngrok dashboard)" 
              value={tokens.ngrokToken}
              onChange={e => setTokens({...tokens, ngrokToken: e.target.value})}
              className="font-mono text-sm bg-muted/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat" className="text-foreground font-medium">Your Telegram Chat ID <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Input 
              id="chat" 
              placeholder="e.g. 123456789" 
              value={tokens.chatID}
              onChange={e => setTokens({...tokens, chatID: e.target.value})}
              className="font-mono text-sm bg-muted/50"
            />
            <div className="flex items-start gap-2 mt-1">
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                If left blank, the bot will automatically lock itself to the first person who sends it a message.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 pt-2 border-t border-border mt-2">
          <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
            Skip for now (Offline Mode)
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!tokens.telegramToken || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Saving..." : "Save & Initialize"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
