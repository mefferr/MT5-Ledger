import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

export async function GET() {
  try {
    const envPath = path.join(process.cwd(), ".env")
    let content = ""
    try {
      content = await fs.readFile(envPath, "utf-8")
    } catch {
      // File doesn't exist yet
    }
    
    // Check if the essential tokens are already in the file
    const hasTelegram = content.includes("TELEGRAM_BOT_TOKEN=") && !content.includes("TELEGRAM_BOT_TOKEN=\"\"")
    
    return NextResponse.json({ isSetup: hasTelegram })
  } catch (err) {
    return NextResponse.json({ isSetup: false })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { telegramToken, ngrokToken, chatID } = body
    
    const envPath = path.join(process.cwd(), ".env")
    
    let content = ""
    try {
      content = await fs.readFile(envPath, "utf-8")
    } catch {
      // File doesn't exist
    }

    // A simple regex approach to replace or append env vars
    const updateEnv = (key: string, value: string) => {
      if (!value) return
      const regex = new RegExp(`^${key}=.*$`, "m")
      if (content.match(regex)) {
        content = content.replace(regex, `${key}="${value}"`)
      } else {
        content += `\n${key}="${value}"`
      }
    }

    updateEnv("TELEGRAM_BOT_TOKEN", telegramToken)
    updateEnv("NGROK_AUTHTOKEN", ngrokToken)
    if (chatID) {
      updateEnv("TELEGRAM_ALLOWED_CHAT_ID", chatID)
    }

    await fs.writeFile(envPath, content.trim() + "\n", "utf-8")
    
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: "Failed to write .env" }, { status: 500 })
  }
}
