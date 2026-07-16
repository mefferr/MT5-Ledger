"""
MT5 Bridge Server
FastAPI server that wraps the MetaTrader5 Python library and exposes REST endpoints
for a Next.js web frontend.
"""

import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import MetaTrader5 as mt5
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from telegram_bot import run_bot
except ImportError:
    run_bot = None

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("mt5_bridge")

# ---------------------------------------------------------------------------
# State flag – tracks whether MT5 initialized successfully
# ---------------------------------------------------------------------------
mt5_connected = False
telegram_task = None

# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global mt5_connected, telegram_task
    logger.info("Initializing MetaTrader5...")
    if mt5.initialize():
        mt5_connected = True
        info = mt5.account_info()
        if info:
            logger.info(
                "MT5 connected – login=%s  server=%s  balance=%.2f",
                info.login,
                info.server,
                info.balance,
            )
            if run_bot:
                logger.info("Starting Telegram Bot...")
                telegram_task = asyncio.create_task(run_bot())
        else:
            logger.info("MT5 initialized but no account info available.")
    else:
        mt5_connected = False
        logger.error(
            "MT5 initialization failed: %s (error code %s)",
            mt5.last_error(),
            mt5.last_error(),
        )
        logger.error("Endpoints will return error responses until MT5 is available.")
    yield
    if telegram_task:
        telegram_task.cancel()
    logger.info("Shutting down MetaTrader5...")
    mt5.shutdown()
    logger.info("MT5 shutdown complete.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="MT5 Bridge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ModifyRequest(BaseModel):
    ticket: int
    symbol: str
    sl: float
    tp: float


class OpenRequest(BaseModel):
    symbol: str
    type: str  # "buy" or "sell"
    volume: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_mt5():
    """Raise 503 if MT5 is not connected."""
    if not mt5_connected:
        raise HTTPException(
            status_code=503,
            detail="MetaTrader5 is not connected. Please start MT5 and restart the bridge.",
        )


def _ts_to_iso(ts) -> str:
    """Convert a UNIX timestamp (int/float) to an ISO-8601 string (UTC, no tz suffix)."""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


# ---------------------------------------------------------------------------
# GET /account
# ---------------------------------------------------------------------------

@app.get("/account")
def get_account():
    _require_mt5()
    info = mt5.account_info()
    if info is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve account info.")

    return {
        "login": info.login,
        "server": info.server,
        "balance": info.balance,
        "equity": info.equity,
        "currency": info.currency,
        "leverage": f"1:{info.leverage}",
        "connected": True,
    }


# ---------------------------------------------------------------------------
# GET /positions
# ---------------------------------------------------------------------------

@app.get("/positions")
def get_positions():
    _require_mt5()
    positions = mt5.positions_get()
    if positions is None:
        logger.warning("positions_get() returned None: %s", mt5.last_error())
        return []

    result = []
    for pos in positions:
        # Determine current price: bid for BUY, ask for SELL
        tick = mt5.symbol_info_tick(pos.symbol)
        if tick:
            price_current = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
        else:
            price_current = pos.price_current

        sym_info = mt5.symbol_info(pos.symbol)
        contract_size = sym_info.trade_contract_size if sym_info else 100.0

        result.append(
            {
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "buy" if pos.type == mt5.ORDER_TYPE_BUY else "sell",
                "volume": pos.volume,
                "price_open": pos.price_open,
                "price_current": price_current,
                "sl": pos.sl,
                "tp": pos.tp,
                "profit": pos.profit,
                "swap": pos.swap,
                "time": _ts_to_iso(pos.time),
                "contract_size": contract_size,
            }
        )

    logger.info("Returning %d open position(s).", len(result))
    return result


# ---------------------------------------------------------------------------
# GET /symbol-info/{symbol}
# ---------------------------------------------------------------------------

@app.get("/symbol-info/{symbol}")
def get_symbol_info(symbol: str):
    _require_mt5()
    info = mt5.symbol_info(symbol)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found.")

    tick = mt5.symbol_info_tick(symbol)
    bid = tick.bid if tick else 0.0
    ask = tick.ask if tick else 0.0

    return {
        "name": info.name,
        "digits": info.digits,
        "point": info.point,
        "trade_stops_level": info.trade_stops_level,
        "bid": bid,
        "ask": ask,
    }


# ---------------------------------------------------------------------------
# POST /modify
# ---------------------------------------------------------------------------

@app.post("/modify")
def modify_position(req: ModifyRequest):
    _require_mt5()
    logger.info(
        "Modifying ticket=%d  symbol=%s  SL=%.5f  TP=%.5f",
        req.ticket,
        req.symbol,
        req.sl,
        req.tp,
    )

    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": req.ticket,
        "symbol": req.symbol,
        "sl": req.sl,
        "tp": req.tp,
    }

    result = mt5.order_send(request)
    if result is None:
        err = mt5.last_error()
        logger.error("order_send returned None: %s", err)
        raise HTTPException(status_code=500, detail=f"order_send failed: {err}")

    success = result.retcode == mt5.TRADE_RETCODE_DONE
    logger.info(
        "Modify result: retcode=%d  comment='%s'  success=%s",
        result.retcode,
        result.comment,
        success,
    )
    return {
        "success": success,
        "retcode": result.retcode,
        "comment": result.comment,
    }


# ---------------------------------------------------------------------------
# POST /open
# ---------------------------------------------------------------------------

@app.post("/open")
def open_position(req: OpenRequest):
    _require_mt5()

    symbol = req.symbol
    order_type_str = req.type.lower()

    # Make sure symbol is available in MarketWatch
    if not mt5.symbol_select(symbol, True):
        raise HTTPException(
            status_code=400, detail=f"Failed to select symbol '{symbol}' in MarketWatch."
        )

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise HTTPException(
            status_code=500, detail=f"Failed to get tick for '{symbol}'."
        )

    if order_type_str == "buy":
        order_type = mt5.ORDER_TYPE_BUY
        price = tick.ask
    elif order_type_str == "sell":
        order_type = mt5.ORDER_TYPE_SELL
        price = tick.bid
    else:
        raise HTTPException(
            status_code=400, detail=f"Invalid order type '{req.type}'. Use 'buy' or 'sell'."
        )

    logger.info(
        "Opening %s %s  volume=%.2f  price=%.5f",
        order_type_str.upper(),
        symbol,
        req.volume,
        price,
    )

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": req.volume,
        "type": order_type,
        "price": price,
        "deviation": 20,
        "magic": 123456,
        "comment": "Batch open",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request)
    if result is None:
        err = mt5.last_error()
        logger.error("order_send returned None: %s", err)
        raise HTTPException(status_code=500, detail=f"order_send failed: {err}")

    success = result.retcode == mt5.TRADE_RETCODE_DONE
    logger.info(
        "Open result: retcode=%d  comment='%s'  order=%d  success=%s",
        result.retcode,
        result.comment,
        result.order,
        success,
    )
    return {
        "success": success,
        "retcode": result.retcode,
        "comment": result.comment,
        "ticket": result.order,
    }


# ---------------------------------------------------------------------------
# GET /history
# ---------------------------------------------------------------------------

@app.get("/history")
def get_history(days: int = Query(default=30, ge=1)):
    _require_mt5()

    # ------------------------------------------------------------------
    # Account info
    # ------------------------------------------------------------------
    acct = mt5.account_info()
    if acct is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve account info.")

    account_block = {
        "account": str(acct.login),
        "name": acct.name,
        "currency": acct.currency,
        "leverage": f"1:{acct.leverage}",
    }

    # ------------------------------------------------------------------
    # Fetch deals
    # ------------------------------------------------------------------
    date_to = datetime.now(tz=timezone.utc) + timedelta(days=1)  # inclusive
    date_from = date_to - timedelta(days=days + 1)

    deals = mt5.history_deals_get(date_from, date_to)
    if deals is None:
        logger.warning("history_deals_get returned None: %s", mt5.last_error())
        return {
            "account": account_block,
            "trades": [],
            "balanceEntries": [],
            "initialDeposit": 0.0,
        }

    logger.info("Fetched %d deal(s) for the last %d day(s).", len(deals), days)

    # ------------------------------------------------------------------
    # Separate balance deals and trade deals
    # ------------------------------------------------------------------
    balance_entries: list[dict] = []
    # Group trade deals by position_id
    position_deals: dict[int, list] = {}

    for deal in deals:
        # Balance / credit / correction operations
        if deal.type == mt5.DEAL_TYPE_BALANCE:
            balance_entries.append(
                {
                    "ticket": deal.ticket,
                    "time": _ts_to_iso(deal.time),
                    "description": deal.comment if deal.comment else "Balance operation",
                    "amount": deal.profit,
                }
            )
            continue

        # Skip deals with no position_id (shouldn't happen, but be safe)
        if deal.position_id == 0:
            continue

        position_deals.setdefault(deal.position_id, []).append(deal)

    # ------------------------------------------------------------------
    # Reconstruct closed trades from paired entry/exit deals
    # ------------------------------------------------------------------
    trades: list[dict] = []

    for pos_id, pos_deals in position_deals.items():
        entry_deal = None
        exit_deal = None

        for d in pos_deals:
            if d.entry == mt5.DEAL_ENTRY_IN:
                entry_deal = d
            elif d.entry == mt5.DEAL_ENTRY_OUT:
                exit_deal = d

        # We need at least the entry deal; skip incomplete groups
        if entry_deal is None:
            continue

        # If there's no exit deal, the trade is still open – skip
        if exit_deal is None:
            continue

        # Sum commissions from both legs
        total_commission = entry_deal.commission + exit_deal.commission

        # Determine type from entry deal
        if entry_deal.type == mt5.DEAL_TYPE_BUY:
            trade_type = "buy"
        else:
            trade_type = "sell"

        trades.append(
            {
                "ticket": pos_id,
                "openTime": _ts_to_iso(entry_deal.time),
                "type": trade_type,
                "size": entry_deal.volume,
                "symbol": entry_deal.symbol,
                "openPrice": entry_deal.price,
                "sl": getattr(exit_deal, "sl", 0.0),
                "tp": getattr(exit_deal, "tp", 0.0),
                "closeTime": _ts_to_iso(exit_deal.time),
                "closePrice": exit_deal.price,
                "commission": round(total_commission, 2),
                "taxes": 0,
                "swap": exit_deal.swap,
                "profit": exit_deal.profit,
            }
        )

    # Sort trades by open time
    trades.sort(key=lambda t: t["openTime"])

    # ------------------------------------------------------------------
    # Initial deposit = first positive balance entry
    # ------------------------------------------------------------------
    initial_deposit = 0.0
    for entry in balance_entries:
        if entry["amount"] > 0:
            initial_deposit = entry["amount"]
            break

    logger.info(
        "History: %d closed trade(s), %d balance entr(y/ies), initial deposit=%.2f",
        len(trades),
        len(balance_entries),
        initial_deposit,
    )

    return {
        "account": account_block,
        "trades": trades,
        "balanceEntries": balance_entries,
        "initialDeposit": initial_deposit,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
