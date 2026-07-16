import os
import logging
import asyncio
from dotenv import load_dotenv
import MetaTrader5 as mt5
from pyngrok import ngrok
import ssl
ssl._create_default_https_context = ssl._create_unverified_context

from telegram import Update, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes, ConversationHandler, CallbackQueryHandler

logger = logging.getLogger("telegram_bot")
ngrok_url = ""

TRADE_LOTS, TRADE_COUNT, TRADE_DELAY = range(3)
SLTP_MODE, SLTP_VALUE = range(3, 5)

def get_allowed_chat_id():
    load_dotenv(override=True)
    return os.getenv("TELEGRAM_ALLOWED_CHAT_ID")

def set_allowed_chat_id(chat_id: str):
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    try:
        with open(env_path, 'r') as f:
            lines = f.readlines()
    except FileNotFoundError:
        lines = []
    
    found = False
    with open(env_path, 'w') as f:
        for line in lines:
            if line.startswith("TELEGRAM_ALLOWED_CHAT_ID="):
                f.write(f"TELEGRAM_ALLOWED_CHAT_ID={chat_id}\n")
                found = True
            else:
                f.write(line)
        if not found:
            f.write(f"\nTELEGRAM_ALLOWED_CHAT_ID={chat_id}\n")

def require_auth(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not update.effective_chat:
            return
        chat_id = str(update.effective_chat.id)
        allowed = get_allowed_chat_id()
        
        if not allowed or allowed.strip() == "":
            set_allowed_chat_id(chat_id)
            allowed = chat_id
            await update.effective_message.reply_text(f"🔒 Bot locked to your Chat ID ({chat_id}). You are now the sole authorized user.")
        
        if chat_id != allowed:
            logger.warning(f"Unauthorized access attempt from {chat_id}")
            return
        
        return await func(update, context)
    return wrapper

def get_menu_keyboard():
    global ngrok_url
    keyboard = [
        [KeyboardButton("📊 Status"), KeyboardButton("📂 Positions")],
        [KeyboardButton("🟢 Buy"), KeyboardButton("🔴 Sell")],
        [KeyboardButton("🛡️ Set SL"), KeyboardButton("🎯 Set TP")]
    ]
    
    if ngrok_url:
        keyboard.insert(0, [KeyboardButton("📱 Open Dashboard (Mini App)", web_app=WebAppInfo(url=ngrok_url))])

    return ReplyKeyboardMarkup(
        keyboard,
        resize_keyboard=True,
        is_persistent=True
    )

def calc_breakeven(positions):
    weighted_sum = 0.0
    total_vol = 0.0
    for p in positions:
        sign = 1 if p.type == mt5.ORDER_TYPE_BUY else -1
        vol = p.volume * sign
        weighted_sum += p.price_open * vol
        total_vol += vol
        
    if total_vol == 0:
        return {"price": 0.0, "volume": 0.0, "direction": "long"}
        
    return {
        "price": weighted_sum / total_vol,
        "volume": abs(total_vol),
        "direction": "long" if total_vol >= 0 else "short"
    }

@require_auth
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global ngrok_url
    msg = "🤖 MT5 Bridge Bot Online\n\nYour permanent dashboard is active below!"
    
    if ngrok_url:
        msg += f"\n\n🌐 **Normal Browser Link:**\nIf the Mini App buttons don't work, tap the link below to open the dashboard in Safari/Chrome:\n{ngrok_url}"
        
    await update.effective_message.reply_text(
        msg,
        reply_markup=get_menu_keyboard()
    )
    
    if ngrok_url:
        from telegram import InlineKeyboardMarkup, InlineKeyboardButton
        inline_kb = InlineKeyboardMarkup([[InlineKeyboardButton("Open in Safari/Chrome", url=ngrok_url)]])
        await update.effective_message.reply_text("Or tap this button to open externally:", reply_markup=inline_kb)
        
    return ConversationHandler.END

@require_auth
async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text("Process cancelled.", reply_markup=get_menu_keyboard())
    return ConversationHandler.END

@require_auth
async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    def get_info():
        return mt5.account_info()
    
    info = await asyncio.to_thread(get_info)
    if not info:
        await update.effective_message.reply_text("❌ MT5 not connected.", reply_markup=get_menu_keyboard())
        return
        
    msg = (
        f"📊 *Account Status*\n"
        f"Server: {info.server}\n"
        f"Login: {info.login}\n"
        f"Balance: {info.balance} {info.currency}\n"
        f"Equity: {info.equity} {info.currency}"
    )
    await update.effective_message.reply_text(msg, parse_mode="Markdown", reply_markup=get_menu_keyboard())

@require_auth
async def positions(update: Update, context: ContextTypes.DEFAULT_TYPE):
    pos = await asyncio.to_thread(mt5.positions_get)
    if pos is None or len(pos) == 0:
        await update.effective_message.reply_text("No open positions.", reply_markup=get_menu_keyboard())
        return
    
    total_pl = sum(p.profit for p in pos)
    msg = f"📂 *Open Positions* ({len(pos)})\n\n"
    
    for p in pos:
        type_str = "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL"
        msg += f"#{p.ticket} {p.symbol} {type_str} {p.volume}\n"
        msg += f"Open: {p.price_open} | Cur: {p.price_current}\n"
        msg += f"SL: {p.sl} | TP: {p.tp}\n"
        msg += f"Profit: {p.profit:.2f}\n\n"
        
    msg += f"💰 *Total P/L:* {total_pl:.2f}"
    
    if len(msg) > 4000:
        msg = msg[:4000] + "\n... [Truncated]"
        
    await update.effective_message.reply_text(msg, parse_mode="Markdown", reply_markup=get_menu_keyboard())

# --- TRADE FLOW ---

@require_auth
async def trade_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.effective_message.text
    trade_type = "buy" if "Buy" in text else "sell"
    context.user_data['trade_type'] = trade_type
    
    await update.effective_message.reply_text(
        f"You selected {trade_type.upper()}.\n\nEnter lot size per position (e.g. 0.01) or /cancel:",
        reply_markup=ReplyKeyboardRemove()
    )
    return TRADE_LOTS

@require_auth
async def trade_lots(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        lots = float(update.effective_message.text)
        if lots <= 0: raise ValueError
        context.user_data['trade_lots'] = lots
    except ValueError:
        await update.effective_message.reply_text("Invalid lot size. Enter a positive number (e.g. 0.01) or /cancel.")
        return TRADE_LOTS
        
    await update.effective_message.reply_text("Enter number of positions to open (e.g. 50):")
    return TRADE_COUNT

@require_auth
async def trade_count(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        count = int(update.effective_message.text)
        if count <= 0: raise ValueError
        context.user_data['trade_count'] = count
    except ValueError:
        await update.effective_message.reply_text("Invalid count. Enter a whole number (e.g. 50) or /cancel.")
        return TRADE_COUNT
        
    await update.effective_message.reply_text("Enter delay in milliseconds (e.g. 300):")
    return TRADE_DELAY

@require_auth
async def trade_delay(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        delay = int(update.effective_message.text)
        if delay < 0: raise ValueError
    except ValueError:
        await update.effective_message.reply_text("Invalid delay. Enter a number (e.g. 300) or /cancel.")
        return TRADE_DELAY
        
    lots = context.user_data['trade_lots']
    count = context.user_data['trade_count']
    trade_type = context.user_data['trade_type']
    
    await update.effective_message.reply_text(f"Executing {count} {trade_type.upper()} orders of {lots} lots with {delay}ms delay...")
    
    symbol = "XAUUSD"
    def do_trade():
        if not mt5.symbol_select(symbol, True): return False
        tick = mt5.symbol_info_tick(symbol)
        if not tick: return False
        o_type = mt5.ORDER_TYPE_BUY if trade_type == "buy" else mt5.ORDER_TYPE_SELL
        price = tick.ask if trade_type == "buy" else tick.bid
        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol, "volume": lots, "type": o_type, "price": price,
            "deviation": 20, "magic": 999, "comment": "Telegram Bot",
            "type_time": mt5.ORDER_TIME_GTC, "type_filling": mt5.ORDER_FILLING_IOC,
        }
        res = mt5.order_send(req)
        return res is not None and res.retcode == mt5.TRADE_RETCODE_DONE

    success, fail = 0, 0
    for _ in range(count):
        res = await asyncio.to_thread(do_trade)
        if res: success += 1
        else: fail += 1
        await asyncio.sleep(delay / 1000.0)
        
    await update.effective_message.reply_text(f"✅ Completed: {success} opened, {fail} failed.", reply_markup=get_menu_keyboard())
    return ConversationHandler.END


# --- SL/TP FLOW ---

@require_auth
async def sltp_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.effective_message.text
    sltp_type = "sl" if "SL" in text else "tp"
    context.user_data['sltp_type'] = sltp_type
    
    keyboard = [
        [
            InlineKeyboardButton("Pips", callback_data="mode:pips"),
            InlineKeyboardButton("Breakeven", callback_data="mode:breakeven"),
            InlineKeyboardButton("Price", callback_data="mode:absolute"),
        ]
    ]
    await update.effective_message.reply_text(
        f"Select {sltp_type.upper()} mode, or /cancel:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return SLTP_MODE

@require_auth
async def sltp_mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    mode = query.data.split(":")[1]
    context.user_data['sltp_mode'] = mode
    
    msg = "Enter pips distance:" if mode != "absolute" else "Enter absolute price level:"
    if mode == "breakeven":
        msg = "Enter pips distance from breakeven price:"
        
    await query.edit_message_text(f"Selected Mode: {mode.capitalize()}\n\n{msg}")
    return SLTP_VALUE

@require_auth
async def sltp_value(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        val = float(update.effective_message.text)
    except ValueError:
        await update.effective_message.reply_text("Invalid value. Enter a number or /cancel.")
        return SLTP_VALUE
        
    mode = context.user_data['sltp_mode']
    sltp_type = context.user_data['sltp_type']
    
    def do_modify():
        pos = mt5.positions_get()
        if not pos: return 0, 0
        
        be = calc_breakeven(pos)
        success, fail = 0, 0
        
        for p in pos:
            sym_info = mt5.symbol_info(p.symbol)
            if not sym_info: continue
            
            point = sym_info.point
            digits = sym_info.digits
            
            new_sl = p.sl
            new_tp = p.tp
            
            if mode == "absolute":
                if sltp_type == "sl": new_sl = val
                else: new_tp = val
            elif mode == "pips":
                pips_price = val * 10 * point
                if p.type == mt5.ORDER_TYPE_BUY:
                    if sltp_type == "sl": new_sl = p.price_open - pips_price
                    else: new_tp = p.price_open + pips_price
                else:
                    if sltp_type == "sl": new_sl = p.price_open + pips_price
                    else: new_tp = p.price_open - pips_price
            elif mode == "breakeven":
                pips_price = val * 10 * point
                be_price = be["price"]
                if be_price > 0:
                    if be["direction"] == "long":
                        if sltp_type == "sl": new_sl = be_price - pips_price
                        else: new_tp = be_price + pips_price
                    else:
                        if sltp_type == "sl": new_sl = be_price + pips_price
                        else: new_tp = be_price - pips_price
            
            new_sl = round(new_sl, digits)
            new_tp = round(new_tp, digits)
            
            req = {
                "action": mt5.TRADE_ACTION_SLTP, "position": p.ticket,
                "symbol": p.symbol, "sl": new_sl, "tp": new_tp,
            }
            res = mt5.order_send(req)
            if res and res.retcode == mt5.TRADE_RETCODE_DONE: success += 1
            else: fail += 1
            
        return success, fail
        
    await update.effective_message.reply_text(f"Applying {sltp_type.upper()} to all positions...")
    s, f = await asyncio.to_thread(do_modify)
    await update.effective_message.reply_text(f"✅ Modified {s} positions. (Failed: {f})", reply_markup=get_menu_keyboard())
    return ConversationHandler.END


async def run_bot():
    load_dotenv(override=True)
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or token.strip() == "":
        logger.error("TELEGRAM_BOT_TOKEN not set.")
        return
        
    ngrok_token = os.getenv("NGROK_AUTHTOKEN")
    if ngrok_token and ngrok_token.strip() != "":
        await asyncio.to_thread(ngrok.set_auth_token, ngrok_token)
        
    try:
        global ngrok_url
        tunnel = await asyncio.to_thread(ngrok.connect, 3000, bind_tls=True)
        ngrok_url = tunnel.public_url
        logger.info(f"Ngrok tunnel established: {ngrok_url}")
    except Exception as e:
        logger.error(f"Failed to start ngrok tunnel: {e}")
        
    app = ApplicationBuilder().token(token).build()
    
    # Simple commands
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.Regex("^📊 Status$"), status))
    app.add_handler(MessageHandler(filters.Regex("^📂 Positions$"), positions))
    
    # Trade Wizard
    trade_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^(🟢 Buy|🔴 Sell)$"), trade_start)],
        states={
            TRADE_LOTS: [MessageHandler(filters.TEXT & ~filters.COMMAND, trade_lots)],
            TRADE_COUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, trade_count)],
            TRADE_DELAY: [MessageHandler(filters.TEXT & ~filters.COMMAND, trade_delay)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    app.add_handler(trade_handler)
    
    # SL/TP Wizard
    sltp_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^(🛡️ Set SL|🎯 Set TP)$"), sltp_start)],
        states={
            SLTP_MODE: [CallbackQueryHandler(sltp_mode, pattern="^mode:")],
            SLTP_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, sltp_value)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    app.add_handler(sltp_handler)
    
    await app.initialize()
    await app.start()
    await app.updater.start_polling()
    
    logger.info("Telegram Bot started via long polling.")
    
    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        logger.info("Stopping Telegram Bot...")
        await app.updater.stop()
        await app.stop()
        await app.shutdown()
