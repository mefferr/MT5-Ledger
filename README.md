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

### Bonus: The GOYA Framework (Get Off Your Ass)

> *"Most people don't avoid action - they avoid evidence."*

P&L is a degenerate metric. It conflates execution quality with leverage exposure, producing a number that tells you almost nothing about whether your process is actually extractable. A trader netting $5,000 on a 50-pip scalp at 10 lots has demonstrated zero edge - they've simply borrowed variance from a fat tail they don't understand. A trader netting $100 on 1000 pips at 0.01 lots has demonstrated a repeatable, distributional edge that scales linearly with capital.

Dollar P&L is **cheap talk**. Pips are **costly signals**. The market doesn't care what you claim your edge is. It only respects the un-fakeable cost you paid to extract directional distance from noise. The GOYA framework strips the dollar signs and evaluates what actually matters: **raw pip extraction, risk geometry, and cognitive integrity.**

**Pip Extraction as the Atomic Unit of Edge**
Dollar P&L is a function of `pips × lots × contract_size`. You control the leverage, but the *market* dictates the distance. The only honest metric of your skill is how many raw pips you can rip from the order book. Stop worrying about account balance. Stack pips. The capital scaling is just a math problem solved downstream by the Kelly criterion.

**Win Rate is a Misleading Statistic**
High win rates are for cowards selling cheap optionality to the market just to feel the psychological comfort of being "right". GOYA inverts this. Risk 50-150 pips to capture a 500-1500 pip runner. If your payoff ratio is 10:1, you only need to be right 10% of the time to break even. The math is brutal and unambiguous - **expectancy is edge multiplied by payoff asymmetry**, not how often you stroke your ego with a green trade.

**Losses Are Probes, Not Failures**
Stop treating red trades as emotional events. They are invoices. Every losing trade is just a low-cost probe deployed to force the market to show its hand. The probe extracts information. If the setup fails, you learned something at a fixed, cheap cost. If it runs, you found the vulnerability. If your probes cost 80 pips and your runners yield 800, you can lose 9 out of 10 times and still compound. They are just the cost of doing business.

**Type II Errors Will Destroy You**
There are two ways to fail. Type I: You take a trade that doesn't work. It costs you a small probe. Type II: You see a massive setup, you hesitate, and you miss a 1,000-pip runner. The cost of a Type II error is catastrophic - not just in missed money, but in the absolute psychological devastation of watching your thesis play out without you.

Type II errors will destroy your mental capital orders of magnitude faster than a stopped-out probe. Bias your entire system toward execution. You need sharp human intuition to read the live tape, yes, but you must assume your setup is valid until the market explicitly proves otherwise. 

**Stop Wasting Your Brainpower on Cope**
You only have so much cognitive bandwidth every day. Most of you are burning 70% of it trying to protect your ego - retroactively editing your thesis mid-trade, making up excuses for why your entry was actually "early" instead of wrong, and managing the internal narrative of being a "good trader". It's the mental equivalent of running a supercomputer just to mine dogecoin for a scammer. 

It's active self-destruction. Every time you rationalize a bad trade instead of just taking the L and logging the data, you are literally wiring your brain to become a better liar. Fast forward six months, and your pattern recognition hardware is completely corrupted. You can't even tell the difference between a high-EV setup and a revenge entry because you've spent half a year lying to yourself.

The GOYA framework exists to kill the cope. The numbers don't care about your story. Pips don't lie.

**The Zero State: Flow State with a Sniper Rifle**
To actually print money in this game, you need to enter what I call the Zero State: absolute cold precision mixed with zero attachment to the outcome. You are calculating risk like a machine, but genuinely do not care if the trade hits TP or SL. It's not some zen detachment bullshit, it's just the massive mechanical advantage you get when you stop letting your ego rub against the charts.

The golden rule of any interaction is this: whoever needs the outcome less, controls the frame. If you *need* a trade to work to pay rent or fix your mood, the market owns you. You will overtrade, you will move stops, and you will sit in drawdown praying to a god that isn't listening. But if you don't need it? You execute with the calm, chilling violence of pure process.

If you can get tilted, you have no edge. I don't care how cracked your technical analysis is. If a 100-pip drawdown makes you sweat and close a trade that was three candles away from a massive runner, your charting skills are useless. Emotional sovereignty isn't a bonus perk. It's the bare minimum required to survive.

**Fixed Lot Sizing (1 Position Rule)**
Always 1 position. Do not "average in" to a loser. Averaging in is just doubling down on a thesis the market is actively disagreeing with. Use a strict, fixed lot size relative to your equity. When the equity doubles, mechanically double the lot size. You only get the right to press your size or stack combos after a verified series of winners and a massive accumulated pip reserve. Until then, you are on a strict diet. 

**Aggressive Trailing SL Based on Local Structure**
When you are live in a position, trail your stop aggressively against local structure. If price chops sideways or drifts 180 pips into drawdown without immediate continuation, the explosive momentum thesis is dead. Cut it immediately. True asymmetric runners show violent rejection off the entry zone and sustained unidirectional flow. If that doesn't happen, the probe failed. Let the market take you out at structure and preserve your mental capital. Sitting in drawdown hoping a trade "comes back" isn't trading, it's gambling fueled by sunk-cost bias and ego.

**Human Psychology and The Market Mirror**
Look, the market isn't out to get you. It doesn't even know you exist. The market is just a massive, completely indifferent mirror reflecting your own bullshit back at you. If your trading is a mess, it's not because your moving average settings are wrong - it's because you're a mess.

When you sit down at the charts, every unresolved ego deficit, every insecurity, and every deep-seated need to be "right" gets exposed and weaponized against you. 
- **FOMO** isn't a trading mistake, it's you vibrating at a frequency of absolute scarcity, terrified that other people are eating while you starve. 
- **Moving your stop loss** isn't a "tactical adjustment." It's pure arrogance. It's an ego so unbelievably fragile that it refuses to take an L, equating a red trade with personal failure. 
- **Revenge Trading** is a childish temper tantrum. It's you demanding the universe bend to your arbitrary standard of fairness.

The market does not care about your rent. It has zero memory of your last 5 losses. When you project your emotional baggage onto a purely probabilistic system, you start hallucinating. You stop trading the order flow and start trading your own anxiety. 

If you want to be the master, you have to kill the ego. Nuke it entirely. Your opinion on where price "should" go is irrelevant unless the order flow agrees with you. You have to wire your brain to view a string of losses not as a personal attack from the universe, but as standard statistical variance. The real edge is the cold, mechanical execution by a mind that has completely eradicated its need to be comfortable.

**View the market as a female Entity (Frame Control & Shit Tests)**
Trading is like an interaction with a female. It is nature's ultimate shit test mechanism. The market is an erratic, highly perceptive entity constantly probing you to see if your projected frame is real, or if you are a fragile, insecure fraud who will collapse the second you face actual pressure - Exactly like a woman.

When the market throws a sudden red candle against your position it's like when a woman is looking dead into your eyes dropping her compliance to zero and asking: *"Are you actually a solid grounded man who stands by his thesis or are you going to have a panic attack like a coward?"* 

The instinct of a weak beta trader is to fight the market. To argue with her. To impose his will through stubbornness - refusing to close a loser, moving stops, or getting angry and revenge trading when stopped out. This is a catastrophic, biologically repulsive error. Anger is a reaction and if you react to her chaos, she controls your internal state. You are bleeding subtextual value. You are showing that you need her validation (P&L) to feel okay. The market biologically repulses from traders who lack emotional sovereignty. She will take your money and give it to the guy who didn't flinch.

True frame control isn't about being stubborn. It's entering what i like to call the Zero State. You observe the market's turbulence like a fascinating insect. You hold your stop loss, you execute your plan, and you remain completely, almost psychotically unbothered by her chaos. The strongest response to a female's emotional provocation is strategic non-reaction. You don't justify your trade. You don't explain your thesis out loud to calm yourself down. You hold the cold void of silence. You let her drown in your non-reaction. 

When she throws a tantrum (volatility) and you don't even blink you break her limbic defense mechanisms. When she realizes your frame is unbreakable and you genuinely don't give a single fuck if the trade hits TP or SL, you don't need the outcome to validate your existence - she submits. The order flow aligns, it bends to your reality, and you stack pips. 

**Time in the Gulag (The Accumulation of Experience)**
It's the accumulation of experience. All the wins, all the losses, all the lessons and observations. The market doesn't move by itself, it requires big money to fluctuate. That big money is in the hands of individuals that need to make those decisions. If you're able to understand how those individuals think and process information, you're able to predict the market as a result. There is no magic way to learn what the big players do. It's all about spending time in the gulag - hours and hours observing movements on the chart and correlating them with fundamentals and the overarching storyline. In simple terms: understanding the worldwide financial agenda and following it to the best of your ability. Stacking pips.

**The Final Word: Just Stack Pips**
Nobody cares about your win rate. Nobody cares if your equity curve looks aesthetically pleasing or if your average win to average loss ratio makes for a good tweet. All of those metrics are irrelevant vanity stats that broke traders use to feel better about themselves. The entire game boils down to one raw mechanic: extracting distance from the market.

Money is an illusion. P&L is just a side effect of leverage. If you stare at the dollar amount, you become a slave to it. You will panic close a runner because the monetary value scares you, and you will hold a loser because you refuse to accept the reality of the invoice. 

Turn off the P&L display. Strip the emotional payload out of the terminal. Your only function is to acquire pips. You are a pip-stacking machine. If you can reliably pull pips out of the market, the money is just a math problem solved by lot sizing. Scale the lot size when your capital grows, but the fundamental action never changes.

Kill the ego, execute the system, and stack pips.

---

## Tech Stack
- **Web UI:** Next.js 14, React, Tailwind, Recharts, shadcn/ui.
- **Backend:** Python 3, FastAPI, Uvicorn, MetaTrader5.
- **Bot:** python-telegram-bot v20+, pyngrok.
