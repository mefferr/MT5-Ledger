# MT5 Ledger

Local analytics dashboard and Python bridge for MetaTrader 5. 

Built because parsing HTML statements manually is annoying, and most SaaS alternatives either charge monthly or harvest your trade data. This is a fully localized, decoupled system designed to rip raw MT4/MT5 HTML reports apart in your browser, or sync directly to your live terminal via a Python bridge.

## Architecture

The system is split into two completely decoupled layers:

1. **The Web Client (Next.js 14 / React)**
   - Responsible for all data visualization, heavy mathematical lifting, and UI state.
   - Runs entirely client-side. If you only want to parse HTML statements, you don't even need the backend. Drop the `.htm` file into the browser, and the DOMParser processes it locally.
2. **The Terminal Bridge (Python / FastAPI / MT5)**
   - A lightweight server that sits on your Windows machine, wrapping the native `MetaTrader5` C-library.
   - Exposes REST endpoints to query account state, fetch open positions, and execute live orders.
   - Runs a Telegram Bot daemon to allow remote execution and Web App tunneling.

---

## The Analytics Engine (Under the Hood)

When you load a statement or sync live data, the analytics engine calculates metrics that actually matter. It doesn't just add up raw profits.

### Capital Normalization
Most basic equity curves break if you deposit or withdraw money midway through trading. The engine parses the chronological order of your trades and balance entries. It determines the exact timestamp of your **first trade** and calculates the "Active Starting Capital" by summing all deposits prior to that moment. The equity curve then charts pure trading performance, completely ignoring subsequent cash injections.

### Advanced Risk Metrics
- **Sharpe Ratio:** Calculated using the per-trade P/L variance relative to the mean return, rather than annualized time-series approximations.
- **Sortino Ratio:** Same as Sharpe, but isolates downside deviation (losing trades) to determine risk-adjusted performance.
- **Kelly Criterion:** Derived dynamically from your win rate, average win, and average loss to suggest optimal position sizing.
- **R-Multiples:** For MT5 statements containing SL data, it approximates your Risk-to-Reward ratio per trade by calculating `Profit / (|Open - SL| * Size)`.

### Distribution & Time Analytics
- **Session Parsing:** Approximates global market sessions (Sydney, Tokyo, London, New York) by mapping trade open-times against UTC hourly offsets.
- **Rolling Win Rate:** Maintains a rolling buffer of your last N trades to chart momentum shifts in your strategy execution.

---

## The Python Bridge & Telegram Bot

The `mt5_bridge.py` script does three things simultaneously:
1. Connects to your running MT5 terminal.
2. Hosts a FastAPI web server on port 3000 to serve the web client.
3. Spawns the `telegram_bot.py` daemon via `asyncio`.

### Trade Execution & Batching
The web client and Telegram bot both support batch execution. If you need to open 50 positions across a grid, doing it manually takes too long. The bridge handles this via a loop that fires asynchronous `mt5.order_send` requests with millisecond delays, ensuring the broker doesn't flag you for spamming the API.

### Telegram Mini-App Tunneling
To view the web dashboard remotely from your phone, the bot uses `pyngrok` to punch a secure TLS tunnel through your router directly to the local FastAPI server. When you tap the "Open Dashboard" button in Telegram, it loads the tunneled URL as a native Telegram Web App. 

### Security Lock
The Telegram bot has no built-in database. Instead, it reads the `.env` file. On first boot, the `TELEGRAM_ALLOWED_CHAT_ID` is empty. The very first person to send a message to the bot has their Chat ID permanently written to the `.env` file. Any subsequent messages from different Chat IDs are silently dropped at the middleware level.

---

## Setup & Deployment

**Prerequisites:**
- Node.js (for the frontend)
- Python 3.10+ and MetaTrader 5 (only if you want live sync & bot)

### 1. Installation
Clone the repo and install both Node and Python dependencies:
```bash
git clone https://github.com/mefferr/MT5-Ledger.git
cd MT5-Ledger

# Node deps
npm install

# Python deps
pip install fastapi uvicorn MetaTrader5 python-telegram-bot pyngrok python-dotenv
```

### 2. Configuration (For Live Sync & Bot)
If you only want to parse offline `.htm` statements, skip this. If you want the live bridge:
```bash
cp .env.example .env
```
Populate `.env` with your actual Telegram bot token and Ngrok auth token.

### 3. Run the Stack
We use `concurrently` to boot the entire system with a single command. 

Just run:
```bash
npm run dev
```
This automatically boots the Next.js frontend on `localhost:3000`, fires up the Python FastAPI bridge, initializes the MT5 connection, and starts the Telegram daemon all at once.

If you don't have Python or MT5 installed, the script will gracefully complain about the bridge failing, but the web UI will still boot perfectly for offline statement parsing.

## Tech Stack
- **Web UI:** Next.js 14, React, Tailwind, Recharts, shadcn/ui.
- **Backend:** Python 3, FastAPI, Uvicorn, MetaTrader5.
- **Bot:** python-telegram-bot v20+, pyngrok.
