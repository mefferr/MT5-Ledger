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

## The GOYA Framework (Get Off Your Ass)

P&L is a degenerate metric. It conflates execution quality with leverage exposure, producing a number that tells you almost nothing about whether your process is actually extractable. A trader netting $5,000 on a 50-pip scalp at 10 lots has demonstrated zero edge - they've simply borrowed variance from a fat tail they don't understand. A trader netting $100 on 1000 pips at 0.01 lots has demonstrated a repeatable, distributional edge that scales linearly with capital.

The GOYA engine in this dashboard strips the dollar signs and evaluates what actually matters: **raw pip extraction, risk geometry, and behavioral discipline.**

### 1. Pip Extraction as the Atomic Unit of Edge
Dollar P&L is a function of `pips × lots × contract_size`. Two of those three variables are arbitrary inputs you control. The only variable the *market* gives you is pip distance. Therefore, the only honest measure of skill is how many pips you can consistently rip from the order book. Stack pips. The capital allocation is a separate, mechanical problem solved downstream by Kelly or fixed-fractional sizing.

### 2. Win Rate is a Misleading Statistic
High win rates are almost always an artifact of wide stops and tight targets — the trader is selling cheap optionality to the market in exchange for psychological comfort. GOYA inverts this: risk 50–150 pips to capture 500–1500. At a 3:1 minimum R:R, you only need a ~25% hit rate to be net positive. At 10:1, you need 10%. The math is unambiguous — **expectancy is the product of edge and payoff asymmetry**, not frequency of being "right."

### 3. Losses Are Fixed Operating Costs
Each losing trade is a probe — a fixed-cost option purchased from the market to test a directional thesis. The `Cost Per Probe` metric tracks the average pip expenditure per failed entry. If your probes cost 80 pips and your runners yield 800, you have a 10:1 payoff ratio. You could lose 9 out of 10 trades and still compound. Stop treating red trades as emotional events. They are invoices.

### 4. Campaign Pyramiding & Tranche Detection
The system automatically detects tranches. If you stack multiple tickets on the same trend within a 4-hour window, GOYA groups them into a single "Campaign" and tracks aggregate pip extraction across all legs. This measures how effectively you press winners when the distribution is clearly in your favor, rather than taking a single conservative exit.

### 5. Fixed Lot Sizing (1 Position Rule)
Always 1 position. Adding a second position while the first is still in drawdown is not "averaging in" — it's doubling your exposure to a thesis that the market is already disagreeing with. Use a strict fixed lot size relative to account equity (e.g., 0.3 lots on 30k). When equity doubles, mechanically upgrade to 0.6 lots. Bonus combos (2x or 3x sizing) are only permitted after a verified series of consecutive winners and a large accumulated pip reserve — at that point you've earned the right to press, either by increasing initial size or pyramiding into a floating winner.

### 6. Aggressive Trailing SL Based on Local Structure
Once a position is live, trail your stop loss aggressively against local structure — recent swing lows for longs, swing highs for shorts. Use discretion and read the order flow, but the principle is non-negotiable: **if price chops sideways or drifts 180 pips into drawdown without immediate continuation, the explosive momentum thesis is dead.** Cut it. True asymmetric runners show violent rejection off the entry zone and sustained unidirectional flow within the first few candles. If that doesn't materialize, the probe has failed — let the market take you out at structure and preserve your mental capital for the next setup. Holding a choppy position hoping it "comes back" is not trading, it's gambling with a sunk-cost bias.

---

## Tech Stack
- **Web UI:** Next.js 14, React, Tailwind, Recharts, shadcn/ui.
- **Backend:** Python 3, FastAPI, Uvicorn, MetaTrader5.
- **Bot:** python-telegram-bot v20+, pyngrok.
