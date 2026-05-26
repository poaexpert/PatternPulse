#!/usr/bin/env python3
"""
ChartSpyder AI — Enterprise Trading Engine v2.0
Multi-ticker async DCA state machine (IDLE → ACTIVE → TRAILING → FROZEN)
running on FastAPI + Robinhood with 12 institutional feature modules.

MODULE A — Risk & System Circuits:
  A1  BreakevenManager        – auto-move stop to entry at 50% of target
  A2  GreedCircuitBreaker     – freeze bot when daily profit cap hit
  A3  TelegramController      – interactive /liquidate callback handler

MODULE B — Smart Order Execution:
  B4  VolumeFilter            – skip entry if 24h volume too low
  B5  OrderExpirationManager  – purge stale safety orders past TTL
  B6  OrderChopper            – split large orders into 3 randomised clips

MODULE C — Mathematical Modifications:
  C7  RSIFilter               – suspend DCA if RSI > threshold (local peak)
  C8  DynamicSizer            – size positions as % of real-time cash balance
  C9  MarketDirection         – LONG/SHORT reverse mode integrated in engine

MODULE D — Reliability & DevOps:
  D10 StatePersistence        – JSON state file, restore on reboot
  D11 ShadowTrader            – parallel virtual-account trade mirror log
  D12 HeartbeatDaemon         – hourly Telegram status ping (uptime/mem/NAV)
"""

# ── Imports ────────────────────────────────────────────────────────────────────

import asyncio
import json
import logging
import os
import random
import time
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import aiofiles
import httpx
import numpy as np
import psutil
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

# Robinhood — import with graceful fallback for environments without auth
try:
    import robin_stocks.robinhood as rs
    ROBIN_AVAILABLE = True
except ImportError:
    ROBIN_AVAILABLE = False

# Telegram
from telegram import Bot, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
)

load_dotenv()

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("chartspyder")

# ── Config ─────────────────────────────────────────────────────────────────────


class Config:
    """
    All runtime configuration loaded from environment variables.
    Set these in Railway → Variables, or in a local .env file.
    """

    # ── Robinhood credentials ─────────────────────────────────────────────
    RH_USERNAME: str = os.getenv("RH_USERNAME", "")
    RH_PASSWORD: str = os.getenv("RH_PASSWORD", "")
    RH_MFA_CODE: str = os.getenv("RH_MFA_CODE", "")       # TOTP secret for 2FA

    # ── Telegram ──────────────────────────────────────────────────────────
    TG_BOT_TOKEN: str = os.getenv("TG_BOT_TOKEN", "")
    TG_CHAT_ID: str = os.getenv("TG_CHAT_ID", "")

    # ── Tickers to trade (comma-separated) ────────────────────────────────
    # Use Robinhood futures symbols: /SI, /GC, or continuous Yahoo-style SI=F
    TICKERS: List[str] = [
        t.strip() for t in os.getenv("TICKERS", "SI=F,GC=F").split(",") if t.strip()
    ]

    # ── Market direction: LONG or SHORT ───────────────────────────────────
    # Module C9 — if SHORT, engine inverts all buy/sell logic
    MARKET_DIRECTION: str = os.getenv("MARKET_DIRECTION", "LONG").upper()

    # ── Strategy parameters ───────────────────────────────────────────────
    TAKE_PROFIT_PCT: float = float(os.getenv("TAKE_PROFIT_PCT", "2.0"))   # %
    STOP_LOSS_PCT: float = float(os.getenv("STOP_LOSS_PCT", "5.0"))       # %
    TRAILING_STOP_PCT: float = float(os.getenv("TRAILING_STOP_PCT", "1.0"))  # % distance

    # DCA safety steps
    SAFETY_ORDER_STEPS: int = int(os.getenv("SAFETY_ORDER_STEPS", "3"))
    SAFETY_STEP_PCT: float = float(os.getenv("SAFETY_STEP_PCT", "1.5"))   # % gap between steps
    SAFETY_VOLUME_SCALE: float = float(os.getenv("SAFETY_VOLUME_SCALE", "1.5"))  # size multiplier

    # ── Module A: Risk circuits ───────────────────────────────────────────
    MAX_DAILY_PROFIT_USD: float = float(os.getenv("MAX_DAILY_PROFIT_USD", "500.0"))

    # ── Module B: Order execution ─────────────────────────────────────────
    MIN_VOLUME_24H: float = float(os.getenv("MIN_VOLUME_24H", "500000.0"))
    MAX_ORDER_LIFETIME_MINUTES: int = int(os.getenv("MAX_ORDER_LIFETIME_MINUTES", "30"))
    ORDER_CHOP_THRESHOLD_USD: float = float(os.getenv("ORDER_CHOP_THRESHOLD_USD", "1000.0"))
    ORDER_CHOP_DELAY_MIN: float = float(os.getenv("ORDER_CHOP_DELAY_MIN", "0.5"))   # seconds
    ORDER_CHOP_DELAY_MAX: float = float(os.getenv("ORDER_CHOP_DELAY_MAX", "2.5"))   # seconds

    # ── Module C: Mathematical ────────────────────────────────────────────
    RSI_PERIOD: int = int(os.getenv("RSI_PERIOD", "14"))
    RSI_SUSPEND_THRESHOLD: float = float(os.getenv("RSI_SUSPEND_THRESHOLD", "75.0"))
    POSITION_SIZE_PCT: float = float(os.getenv("POSITION_SIZE_PCT", "10.0"))  # % of cash per base order

    # ── Timing ────────────────────────────────────────────────────────────
    SCAN_INTERVAL_SECONDS: int = int(os.getenv("SCAN_INTERVAL_SECONDS", "30"))
    HEARTBEAT_INTERVAL_HOURS: float = float(os.getenv("HEARTBEAT_INTERVAL_HOURS", "1.0"))

    # ── Module D: Persistence ────────────────────────────────────────────
    STATE_BACKUP_FILE: str = os.getenv("STATE_BACKUP_FILE", "state_backup.json")

    # ── Shadow trader alternate config ────────────────────────────────────
    SHADOW_TAKE_PROFIT_PCT: float = float(os.getenv("SHADOW_TAKE_PROFIT_PCT", "3.0"))
    SHADOW_STOP_LOSS_PCT: float = float(os.getenv("SHADOW_STOP_LOSS_PCT", "7.0"))
    SHADOW_POSITION_SIZE_PCT: float = float(os.getenv("SHADOW_POSITION_SIZE_PCT", "15.0"))


# ── Enums & Dataclasses ────────────────────────────────────────────────────────


class TradeState(str, Enum):
    IDLE = "IDLE"
    ACTIVE = "ACTIVE"
    TRAILING = "TRAILING"
    FROZEN = "FROZEN"


class MarketDirection(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"


@dataclass
class SafetyOrder:
    step: int                        # 1-based step index
    trigger_price: float             # price at which to place the order
    order_size_usd: float
    order_id: Optional[str] = None
    status: str = "pending"          # pending | filled | cancelled | expired
    placed_at: Optional[datetime] = None
    filled_at: Optional[datetime] = None

    def is_stale(self) -> bool:
        if self.status != "pending" or self.placed_at is None:
            return False
        ttl = timedelta(minutes=Config.MAX_ORDER_LIFETIME_MINUTES)
        return datetime.utcnow() - self.placed_at > ttl


@dataclass
class TickerPosition:
    """Per-ticker stateful position tracking."""
    ticker: str
    state: TradeState = TradeState.IDLE
    direction: MarketDirection = MarketDirection(Config.MARKET_DIRECTION)

    # Position data
    average_entry: float = 0.0
    total_quantity: float = 0.0
    total_invested_usd: float = 0.0
    safety_orders: List[SafetyOrder] = field(default_factory=list)

    # Dynamic stop-loss (overridden by breakeven module)
    stop_loss_price: float = 0.0

    # Trailing state
    peak_price: float = 0.0           # highest (LONG) or lowest (SHORT) since TRAILING
    trailing_stop_price: float = 0.0

    # Flags
    breakeven_moved: bool = False
    safety_orders_suspended: bool = False  # RSI filter flag

    # Timestamps
    entered_at: Optional[datetime] = None
    state_changed_at: datetime = field(default_factory=datetime.utcnow)

    def transition(self, new_state: TradeState) -> None:
        log.info("[%s] %s → %s", self.ticker, self.state.value, new_state.value)
        self.state = new_state
        self.state_changed_at = datetime.utcnow()

    def unrealised_pnl(self, current_price: float) -> float:
        if self.total_quantity == 0 or self.average_entry == 0:
            return 0.0
        if self.direction == MarketDirection.LONG:
            return (current_price - self.average_entry) * self.total_quantity
        else:  # SHORT
            return (self.average_entry - current_price) * self.total_quantity

    def profit_pct(self, current_price: float) -> float:
        if self.average_entry == 0:
            return 0.0
        if self.direction == MarketDirection.LONG:
            return (current_price - self.average_entry) / self.average_entry * 100
        else:
            return (self.average_entry - current_price) / self.average_entry * 100

    def to_dict(self) -> Dict:
        """JSON-serialisable snapshot (used by StatePersistence)."""
        d = asdict(self)
        d["state"] = self.state.value
        d["direction"] = self.direction.value
        # Serialise datetimes
        for key in ("entered_at", "state_changed_at"):
            if d[key] is not None:
                d[key] = d[key].isoformat()
        for so in d["safety_orders"]:
            for k in ("placed_at", "filled_at"):
                if so[k] is not None:
                    so[k] = so[k].isoformat()
        return d

    @classmethod
    def from_dict(cls, d: Dict) -> "TickerPosition":
        """Reconstruct from JSON snapshot."""
        d = dict(d)
        d["state"] = TradeState(d["state"])
        d["direction"] = MarketDirection(d["direction"])
        for key in ("entered_at", "state_changed_at"):
            if d[key]:
                d[key] = datetime.fromisoformat(d[key])
        orders = []
        for so in d.get("safety_orders", []):
            for k in ("placed_at", "filled_at"):
                if so[k]:
                    so[k] = datetime.fromisoformat(so[k])
            orders.append(SafetyOrder(**so))
        d["safety_orders"] = orders
        return cls(**d)


# ── Module A1: Breakeven Manager ───────────────────────────────────────────────


class BreakevenManager:
    """
    A1 — Once a position hits 50 % of the TAKE_PROFIT_PCT target, move the
    stop-loss boundary to the exact average entry price (breakeven).
    """

    def evaluate(self, pos: TickerPosition, current_price: float) -> None:
        if pos.state != TradeState.ACTIVE or pos.breakeven_moved:
            return
        halfway_pct = Config.TAKE_PROFIT_PCT / 2.0
        if pos.profit_pct(current_price) >= halfway_pct:
            old_stop = pos.stop_loss_price
            pos.stop_loss_price = pos.average_entry
            pos.breakeven_moved = True
            log.info(
                "[%s] Breakeven triggered — stop moved: %.4f → %.4f (entry)",
                pos.ticker, old_stop, pos.average_entry,
            )


# ── Module A2: Greed Circuit Breaker ──────────────────────────────────────────


class GreedCircuitBreaker:
    """
    A2 — Track rolling 24-hour realised profits.  When total closed-trade PnL
    reaches MAX_DAILY_PROFIT_USD, return True (engine transitions to FROZEN).
    """

    def __init__(self) -> None:
        # deque of (timestamp, realised_profit_usd) tuples
        self._log: List[Tuple[datetime, float]] = []

    def record(self, profit_usd: float) -> bool:
        """Record a realised profit/loss. Returns True if daily cap breached."""
        self._log.append((datetime.utcnow(), profit_usd))
        self._trim()
        total = sum(p for _, p in self._log)
        triggered = total >= Config.MAX_DAILY_PROFIT_USD
        if triggered:
            log.warning(
                "Greed circuit TRIGGERED — daily profit %.2f USD >= %.2f limit",
                total, Config.MAX_DAILY_PROFIT_USD,
            )
        return triggered

    def daily_total(self) -> float:
        self._trim()
        return sum(p for _, p in self._log)

    def _trim(self) -> None:
        cutoff = datetime.utcnow() - timedelta(hours=24)
        self._log = [(t, p) for t, p in self._log if t >= cutoff]


# ── Module A3: Telegram Controller (+ D12 Heartbeat) ─────────────────────────


class TelegramController:
    """
    A3 — Sends trade notifications and accepts interactive commands.
    D12 — Background heartbeat task pings status every hour.

    Commands accepted:
      /status     — current state of all tickers
      /liquidate  — immediately market-sell all active positions
      /freeze     — manually freeze the bot
      /unfreeze   — resume from FROZEN
    """

    def __init__(self) -> None:
        self._bot: Optional[Bot] = None
        self._app: Optional[Application] = None
        self._engine_ref: Optional[Any] = None   # set by TradingEngine
        self._start_time = datetime.utcnow()

    def set_engine(self, engine: Any) -> None:
        self._engine_ref = engine

    async def start(self) -> None:
        if not Config.TG_BOT_TOKEN:
            log.warning("TG_BOT_TOKEN not set — Telegram disabled")
            return
        self._app = (
            Application.builder()
            .token(Config.TG_BOT_TOKEN)
            .build()
        )
        self._bot = self._app.bot
        self._app.add_handler(CommandHandler("status", self._cmd_status))
        self._app.add_handler(CommandHandler("liquidate", self._cmd_liquidate))
        self._app.add_handler(CommandHandler("freeze", self._cmd_freeze))
        self._app.add_handler(CommandHandler("unfreeze", self._cmd_unfreeze))
        await self._app.initialize()
        await self._app.start()
        await self._app.updater.start_polling(drop_pending_updates=True)
        log.info("Telegram bot polling started")

    async def stop(self) -> None:
        if self._app:
            await self._app.updater.stop()
            await self._app.stop()
            await self._app.shutdown()

    # ── Outbound notifications ────────────────────────────────────────────

    async def send(self, text: str) -> None:
        if not (self._bot and Config.TG_CHAT_ID):
            return
        try:
            await self._bot.send_message(
                chat_id=Config.TG_CHAT_ID,
                text=text,
                parse_mode="HTML",
            )
        except Exception as exc:
            log.error("Telegram send failed: %s", exc)

    async def notify_entry(self, ticker: str, price: float, qty: float, direction: str) -> None:
        emoji = "🟢" if direction == "LONG" else "🔴"
        await self.send(
            f"{emoji} <b>ENTRY</b> — <code>{ticker}</code>\n"
            f"Direction: <b>{direction}</b>\n"
            f"Price: <b>{price:.4f}</b>  Qty: <b>{qty:.4f}</b>"
        )

    async def notify_exit(self, ticker: str, price: float, pnl: float) -> None:
        emoji = "✅" if pnl >= 0 else "🛑"
        await self.send(
            f"{emoji} <b>EXIT</b> — <code>{ticker}</code>\n"
            f"Exit price: <b>{price:.4f}</b>  PnL: <b>{pnl:+.2f} USD</b>"
        )

    async def notify_state(self, ticker: str, old: str, new: str, note: str = "") -> None:
        await self.send(
            f"⚙️ <b>{ticker}</b>  {old} → <b>{new}</b>"
            + (f"\n{note}" if note else "")
        )

    async def notify_freeze(self, reason: str) -> None:
        await self.send(f"🧊 <b>BOT FROZEN</b>\n{reason}")

    # ── D12: Heartbeat daemon ─────────────────────────────────────────────

    async def heartbeat_loop(self) -> None:
        """Background task — sends a structured status ping every hour."""
        while True:
            await asyncio.sleep(Config.HEARTBEAT_INTERVAL_HOURS * 3600)
            await self._send_heartbeat()

    async def _send_heartbeat(self) -> None:
        uptime = datetime.utcnow() - self._start_time
        hours, rem = divmod(int(uptime.total_seconds()), 3600)
        minutes = rem // 60
        proc = psutil.Process()
        mem_mb = proc.memory_info().rss / 1024 / 1024

        nav = 0.0
        open_summary = ""
        if self._engine_ref:
            nav = await self._engine_ref.calculate_nav()
            lines = []
            for ticker, pos in self._engine_ref.positions.items():
                lines.append(f"  • <code>{ticker}</code>  {pos.state.value}")
            open_summary = "\n".join(lines) if lines else "  (none)"

        daily_profit = (
            self._engine_ref.greed_circuit.daily_total()
            if self._engine_ref else 0.0
        )

        msg = (
            f"💓 <b>Heartbeat</b>  {datetime.utcnow().strftime('%H:%M UTC')}\n"
            f"Uptime: <b>{hours}h {minutes}m</b>\n"
            f"Memory: <b>{mem_mb:.1f} MB</b>\n"
            f"NAV: <b>${nav:,.2f}</b>\n"
            f"Daily PnL: <b>${daily_profit:+.2f}</b>\n"
            f"Tickers:\n{open_summary}"
        )
        await self.send(msg)

    # ── Command handlers ──────────────────────────────────────────────────

    async def _cmd_status(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        if not self._engine_ref:
            await update.message.reply_text("Engine not ready.")
            return
        lines = [f"<b>ChartSpyder AI — Status</b>"]
        for ticker, pos in self._engine_ref.positions.items():
            lines.append(
                f"\n<code>{ticker}</code>  {pos.state.value}\n"
                f"  Avg entry: {pos.average_entry:.4f}  Qty: {pos.total_quantity:.4f}\n"
                f"  Safety orders: {len(pos.safety_orders)}"
            )
        lines.append(f"\nFrozen: {self._engine_ref.is_globally_frozen}")
        lines.append(f"Daily PnL: ${self._engine_ref.greed_circuit.daily_total():+.2f}")
        await update.message.reply_text("\n".join(lines), parse_mode="HTML")

    async def _cmd_liquidate(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        """A3 — Immediately market-sell all active positions."""
        if not self._engine_ref:
            await update.message.reply_text("Engine not ready.")
            return
        await update.message.reply_text("⚡ Executing emergency liquidation of all positions…")
        count = await self._engine_ref.liquidate_all(reason="Telegram /liquidate command")
        await update.message.reply_text(
            f"✅ Liquidated {count} position(s). Bot is now FROZEN."
        )

    async def _cmd_freeze(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        if self._engine_ref:
            self._engine_ref.is_globally_frozen = True
            await update.message.reply_text("🧊 Bot manually FROZEN — no new entries.")

    async def _cmd_unfreeze(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        if self._engine_ref:
            self._engine_ref.is_globally_frozen = False
            for pos in self._engine_ref.positions.values():
                if pos.state == TradeState.FROZEN:
                    pos.transition(TradeState.IDLE)
            await update.message.reply_text("✅ Bot UNFROZEN — scanning for entries.")


# ── Module B4: Volume Filter ──────────────────────────────────────────────────


class VolumeFilter:
    """
    B4 — Before transitioning IDLE → ACTIVE, fetch the asset's 24-hour trading
    volume.  Abort entry if below MIN_VOLUME_24H.
    Uses Yahoo Finance query as a free public data source.
    """

    async def passes(self, ticker: str) -> bool:
        volume = await self._fetch_volume(ticker)
        ok = volume >= Config.MIN_VOLUME_24H
        if not ok:
            log.warning(
                "[%s] Volume filter REJECTED — %.0f < %.0f minimum",
                ticker, volume, Config.MIN_VOLUME_24H,
            )
        return ok

    async def _fetch_volume(self, ticker: str) -> float:
        # Yahoo Finance v8 quote (no auth required)
        sym = ticker.replace("=F", "%3DF").replace("/", "")
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1d"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    url,
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                data = r.json()
                vol = (
                    data.get("chart", {})
                    .get("result", [{}])[0]
                    .get("indicators", {})
                    .get("quote", [{}])[0]
                    .get("volume", [None])
                )
                if vol and vol[-1] is not None:
                    return float(vol[-1])
        except Exception as exc:
            log.warning("[%s] Volume fetch failed (%s) — defaulting to pass", ticker, exc)
        return float("inf")   # fail-open: don't block trades if data unavailable


# ── Module B5: Order Expiration Manager ───────────────────────────────────────


class OrderExpirationManager:
    """
    B5 — Scan safety order list for entries older than MAX_ORDER_LIFETIME_MINUTES
    that are still pending/unfilled.  Cancel them via the broker and mark for
    re-evaluation on the next scan cycle.
    """

    def __init__(self, broker: "RobinhoodClient") -> None:
        self._broker = broker

    async def purge_stale(self, pos: TickerPosition) -> int:
        """Returns count of orders purged."""
        purged = 0
        for so in pos.safety_orders:
            if so.is_stale():
                log.info(
                    "[%s] Expiring stale safety order step %d (placed %s)",
                    pos.ticker, so.step, so.placed_at,
                )
                if so.order_id:
                    await self._broker.cancel_order(so.order_id)
                so.status = "expired"
                purged += 1
        return purged


# ── Module B6: Order Chopper ──────────────────────────────────────────────────


class OrderChopper:
    """
    B6 — When an order value exceeds ORDER_CHOP_THRESHOLD_USD, split it into
    three randomised clips placed sequentially with short random time delays.
    This reduces market footprint / slippage visibility.
    """

    def __init__(self, broker: "RobinhoodClient") -> None:
        self._broker = broker

    async def execute(
        self,
        ticker: str,
        total_usd: float,
        price: float,
        side: str,                 # "buy" or "sell"
        direction: MarketDirection,
    ) -> List[str]:
        """Returns list of order IDs placed."""
        if total_usd < Config.ORDER_CHOP_THRESHOLD_USD:
            return [await self._broker.place_order(ticker, total_usd, price, side, direction)]

        clips = self._split_three(total_usd)
        log.info(
            "[%s] Chopping %.2f USD into clips: %s",
            ticker, total_usd, [f"{c:.2f}" for c in clips],
        )
        ids: List[str] = []
        for i, clip_usd in enumerate(clips):
            if i > 0:
                delay = random.uniform(
                    Config.ORDER_CHOP_DELAY_MIN,
                    Config.ORDER_CHOP_DELAY_MAX,
                )
                await asyncio.sleep(delay)
            oid = await self._broker.place_order(ticker, clip_usd, price, side, direction)
            ids.append(oid)
        return ids

    @staticmethod
    def _split_three(total: float) -> List[float]:
        """Split total into three non-uniform parts that sum to total."""
        r1 = random.uniform(0.25, 0.45)
        r2 = random.uniform(0.25, min(0.45, 1 - r1 - 0.10))
        r3 = 1.0 - r1 - r2
        parts = [total * r1, total * r2, total * r3]
        random.shuffle(parts)
        return parts


# ── Module C7: RSI Filter ─────────────────────────────────────────────────────


class RSIFilter:
    """
    C7 — Compute a short-term RSI from recent close prices.
    If RSI > RSI_SUSPEND_THRESHOLD (default 75), suspend safety DCA executions
    to avoid buying into a local peak.
    For SHORT direction the logic is symmetric: RSI < (100 - threshold)
    suspends adding to short positions to avoid shorting a local trough.
    """

    def __init__(self, period: int = None) -> None:
        self._period = period or Config.RSI_PERIOD

    def calculate(self, closes: List[float]) -> float:
        """
        Standard Wilder RSI.  Requires at least period+1 data points.
        Returns 50.0 (neutral) if insufficient data.
        """
        if len(closes) < self._period + 1:
            return 50.0
        arr = np.array(closes, dtype=float)
        deltas = np.diff(arr)
        gains = np.where(deltas > 0, deltas, 0.0)
        losses = np.where(deltas < 0, -deltas, 0.0)
        # Initialise with simple average over first window
        avg_gain = np.mean(gains[: self._period])
        avg_loss = np.mean(losses[: self._period])
        # Wilder smoothing over remainder
        for i in range(self._period, len(deltas)):
            avg_gain = (avg_gain * (self._period - 1) + gains[i]) / self._period
            avg_loss = (avg_loss * (self._period - 1) + losses[i]) / self._period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return round(100.0 - 100.0 / (1.0 + rs), 2)

    def should_suspend_dca(self, closes: List[float], direction: MarketDirection) -> bool:
        rsi = self.calculate(closes)
        if direction == MarketDirection.LONG:
            suspended = rsi > Config.RSI_SUSPEND_THRESHOLD
        else:
            # For shorts, suspend adding if RSI is at an oversold extreme
            suspended = rsi < (100.0 - Config.RSI_SUSPEND_THRESHOLD)
        if suspended:
            log.info("RSI=%.1f — DCA suspended (direction=%s)", rsi, direction.value)
        return suspended


# ── Module C8: Dynamic Sizer ──────────────────────────────────────────────────


class DynamicSizer:
    """
    C8 — Calculate base order size as a live fractional percentage of the
    account's available cash balance rather than a fixed static dollar amount.
    """

    def __init__(self, broker: "RobinhoodClient") -> None:
        self._broker = broker

    async def base_order_usd(self) -> float:
        """Returns dollar value for the base entry order."""
        cash = await self._broker.get_cash_balance()
        return max(cash * (Config.POSITION_SIZE_PCT / 100.0), 1.0)

    async def safety_order_usd(self, step: int, base_usd: float) -> float:
        """Each safety step is SAFETY_VOLUME_SCALE^step times the base size."""
        return base_usd * (Config.SAFETY_VOLUME_SCALE ** step)


# ── Module D10: State Persistence ────────────────────────────────────────────


class StatePersistence:
    """
    D10 — Async JSON serialisation of the global position state dict.
    Written every time a state transition occurs.
    On startup, the engine calls load() to restore any active trades.
    """

    FILE = Config.STATE_BACKUP_FILE

    async def save(self, positions: Dict[str, TickerPosition]) -> None:
        payload = {
            "saved_at": datetime.utcnow().isoformat(),
            "positions": {t: p.to_dict() for t, p in positions.items()},
        }
        try:
            async with aiofiles.open(self.FILE, "w") as f:
                await f.write(json.dumps(payload, indent=2))
            log.debug("State persisted to %s", self.FILE)
        except Exception as exc:
            log.error("State save failed: %s", exc)

    async def load(self) -> Optional[Dict[str, TickerPosition]]:
        if not os.path.exists(self.FILE):
            return None
        try:
            async with aiofiles.open(self.FILE, "r") as f:
                raw = await f.read()
            payload = json.loads(raw)
            positions = {
                t: TickerPosition.from_dict(d)
                for t, d in payload.get("positions", {}).items()
            }
            log.info(
                "Recovered %d position(s) from %s (saved %s)",
                len(positions), self.FILE, payload.get("saved_at", "?"),
            )
            return positions
        except Exception as exc:
            log.error("State load failed: %s — starting fresh", exc)
            return None


# ── Module D11: Shadow Trader ─────────────────────────────────────────────────


@dataclass
class ShadowTrade:
    ticker: str
    direction: str
    entry_price: float
    quantity: float
    take_profit_pct: float
    stop_loss_pct: float
    opened_at: datetime = field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
    exit_price: Optional[float] = None
    virtual_pnl: Optional[float] = None
    status: str = "open"  # open | closed


class ShadowTrader:
    """
    D11 — Maintains a parallel virtual-account log alongside live trades.
    Uses Config.SHADOW_* parameters to simulate a strategy variation.
    All shadow actions are logged to memory — no real orders are ever placed.
    """

    def __init__(self) -> None:
        self._trades: List[ShadowTrade] = []
        self._virtual_pnl: float = 0.0

    def open_trade(
        self,
        ticker: str,
        direction: str,
        entry_price: float,
        quantity: float,
    ) -> None:
        trade = ShadowTrade(
            ticker=ticker,
            direction=direction,
            entry_price=entry_price,
            quantity=quantity,
            take_profit_pct=Config.SHADOW_TAKE_PROFIT_PCT,
            stop_loss_pct=Config.SHADOW_STOP_LOSS_PCT,
        )
        self._trades.append(trade)
        log.info(
            "[SHADOW] Open %s %s @ %.4f (tp=%.1f%% sl=%.1f%%)",
            direction, ticker, entry_price,
            Config.SHADOW_TAKE_PROFIT_PCT, Config.SHADOW_STOP_LOSS_PCT,
        )

    def evaluate(self, ticker: str, current_price: float) -> None:
        """Check shadow trades against current price; close if TP/SL hit."""
        for trade in self._trades:
            if trade.ticker != ticker or trade.status != "open":
                continue
            tp_price = (
                trade.entry_price * (1 + trade.take_profit_pct / 100)
                if trade.direction == "LONG"
                else trade.entry_price * (1 - trade.take_profit_pct / 100)
            )
            sl_price = (
                trade.entry_price * (1 - trade.stop_loss_pct / 100)
                if trade.direction == "LONG"
                else trade.entry_price * (1 + trade.stop_loss_pct / 100)
            )
            hit = (
                (trade.direction == "LONG" and (current_price >= tp_price or current_price <= sl_price))
                or (trade.direction == "SHORT" and (current_price <= tp_price or current_price >= sl_price))
            )
            if hit:
                self._close_trade(trade, current_price)

    def _close_trade(self, trade: ShadowTrade, exit_price: float) -> None:
        if trade.direction == "LONG":
            pnl = (exit_price - trade.entry_price) * trade.quantity
        else:
            pnl = (trade.entry_price - exit_price) * trade.quantity
        trade.exit_price = exit_price
        trade.virtual_pnl = pnl
        trade.closed_at = datetime.utcnow()
        trade.status = "closed"
        self._virtual_pnl += pnl
        log.info(
            "[SHADOW] Close %s %s @ %.4f  PnL: %+.2f  (total virtual: %+.2f)",
            trade.direction, trade.ticker, exit_price, pnl, self._virtual_pnl,
        )

    def summary(self) -> Dict:
        closed = [t for t in self._trades if t.status == "closed"]
        open_ = [t for t in self._trades if t.status == "open"]
        return {
            "virtual_total_pnl": round(self._virtual_pnl, 2),
            "total_trades": len(self._trades),
            "open_trades": len(open_),
            "closed_trades": len(closed),
            "win_rate": (
                round(sum(1 for t in closed if (t.virtual_pnl or 0) > 0) / len(closed) * 100, 1)
                if closed else None
            ),
        }


# ── Robinhood Client Abstraction ──────────────────────────────────────────────


class RobinhoodClient:
    """
    Thin async wrapper around the synchronous robin_stocks library.
    Blocking calls are dispatched to a thread pool via run_in_executor so
    they do not block the asyncio event loop.
    """

    def __init__(self) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._logged_in = False

    async def login(self) -> None:
        self._loop = asyncio.get_event_loop()
        if not ROBIN_AVAILABLE:
            log.warning("robin_stocks not available — running in PAPER mode")
            return
        if not Config.RH_USERNAME:
            log.warning("RH credentials not configured — PAPER mode")
            return
        kwargs = dict(username=Config.RH_USERNAME, password=Config.RH_PASSWORD)
        if Config.RH_MFA_CODE:
            kwargs["mfa_code"] = Config.RH_MFA_CODE
        await self._run(rs.login, **kwargs)
        self._logged_in = True
        log.info("Robinhood login successful")

    async def logout(self) -> None:
        if self._logged_in:
            await self._run(rs.logout)

    async def get_cash_balance(self) -> float:
        """Returns buying power / available cash."""
        if not self._logged_in:
            return 10000.0   # paper mode default
        data = await self._run(rs.profiles.load_account_profile)
        return float(data.get("portfolio_cash", 0.0))

    async def get_latest_price(self, ticker: str) -> float:
        """Fetch real-time last price. Falls back to Yahoo if not logged in."""
        if not self._logged_in:
            return await self._yahoo_price(ticker)
        prices = await self._run(rs.stocks.get_latest_price, ticker)
        if prices and prices[0]:
            return float(prices[0])
        return await self._yahoo_price(ticker)

    async def get_price_history(self, ticker: str, count: int = 60) -> List[float]:
        """Return list of recent close prices for RSI calculation."""
        if not self._logged_in:
            return await self._yahoo_closes(ticker, count)
        raw = await self._run(
            rs.stocks.get_stock_historicals,
            ticker,
            interval="5minute",
            span="day",
        )
        closes = [float(b["close_price"]) for b in (raw or []) if b.get("close_price")]
        return closes[-count:] if closes else await self._yahoo_closes(ticker, count)

    async def place_order(
        self,
        ticker: str,
        amount_usd: float,
        price: float,
        side: str,
        direction: MarketDirection,
    ) -> str:
        """
        Place a market order.  Returns a synthetic or real order ID.
        For futures, calls futures-specific endpoints.
        For SHORT direction, 'buy' means buy-to-cover and 'sell' means sell-to-open.
        """
        qty = amount_usd / price if price > 0 else 0
        log.info(
            "[ORDER] %s %s %s  qty=%.4f  @~%.4f  ($%.2f)",
            side.upper(), direction.value, ticker, qty, price, amount_usd,
        )
        if not self._logged_in:
            return f"PAPER-{ticker}-{side}-{int(time.time())}"

        is_futures = ticker.endswith("=F") or ticker.startswith("/")
        try:
            if is_futures:
                account = (await self._run(rs.futures.get_futures_accounts))[0]["account_number"]
                if side == "buy":
                    result = await self._run(
                        rs.futures.order_buy_futures_market, ticker, qty, account
                    )
                else:
                    result = await self._run(
                        rs.futures.order_sell_futures_market, ticker, qty, account
                    )
            else:
                if side == "buy":
                    result = await self._run(
                        rs.orders.order_buy_market, ticker, qty
                    )
                else:
                    result = await self._run(
                        rs.orders.order_sell_market, ticker, qty
                    )
            return result.get("id", "unknown")
        except Exception as exc:
            log.error("[ORDER] Placement failed for %s: %s", ticker, exc)
            return "error"

    async def place_limit_order(
        self, ticker: str, amount_usd: float, limit_price: float, side: str
    ) -> str:
        qty = amount_usd / limit_price if limit_price > 0 else 0
        log.info(
            "[LIMIT] %s %s  qty=%.4f  limit=%.4f  ($%.2f)",
            side.upper(), ticker, qty, limit_price, amount_usd,
        )
        if not self._logged_in:
            return f"PAPER-LMT-{ticker}-{int(time.time())}"
        try:
            if side == "buy":
                result = await self._run(
                    rs.orders.order_buy_limit, ticker, qty, limit_price
                )
            else:
                result = await self._run(
                    rs.orders.order_sell_limit, ticker, qty, limit_price
                )
            return result.get("id", "unknown")
        except Exception as exc:
            log.error("[LIMIT] Failed: %s", exc)
            return "error"

    async def cancel_order(self, order_id: str) -> bool:
        if not self._logged_in or order_id.startswith("PAPER"):
            return True
        try:
            await self._run(rs.orders.cancel_stock_order, order_id)
            return True
        except Exception as exc:
            log.error("Cancel order %s failed: %s", order_id, exc)
            return False

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _run(self, fn, *args, **kwargs):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))

    async def _yahoo_price(self, ticker: str) -> float:
        sym = ticker.replace("=F", "%3DF").replace("/", "")
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1m"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                data = r.json()
                closes = (
                    data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
                )
                vals = [c for c in closes if c is not None]
                return float(vals[-1]) if vals else 0.0
        except Exception:
            return 0.0

    async def _yahoo_closes(self, ticker: str, count: int) -> List[float]:
        sym = ticker.replace("=F", "%3DF").replace("/", "")
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=5d&interval=5m"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                data = r.json()
                closes = (
                    data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
                )
                vals = [float(c) for c in closes if c is not None]
                return vals[-count:]
        except Exception:
            return []


# ── Core Trading Engine ────────────────────────────────────────────────────────


class TradingEngine:
    """
    Core multi-ticker async state machine.
    Owns all module instances and drives the per-ticker IDLE→ACTIVE→TRAILING loop.
    """

    def __init__(self) -> None:
        self.broker = RobinhoodClient()
        self.positions: Dict[str, TickerPosition] = {}
        self.is_globally_frozen = False

        # ── Module instances ──────────────────────────────────────────────
        self.breakeven = BreakevenManager()                         # A1
        self.greed_circuit = GreedCircuitBreaker()                  # A2
        self.telegram = TelegramController()                        # A3 + D12
        self.volume_filter = VolumeFilter()                         # B4
        self.expiration_mgr = OrderExpirationManager(self.broker)   # B5
        self.chopper = OrderChopper(self.broker)                    # B6
        self.rsi_filter = RSIFilter()                               # C7
        self.sizer = DynamicSizer(self.broker)                      # C8
        self.persistence = StatePersistence()                       # D10
        self.shadow = ShadowTrader()                                # D11
        # D12 HeartbeatDaemon is part of TelegramController

        self.telegram.set_engine(self)
        self._direction = MarketDirection(Config.MARKET_DIRECTION)

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        log.info("ChartSpyder AI initialising…")
        await self.broker.login()

        # D10 — restore persisted state on boot
        restored = await self.persistence.load()
        if restored:
            self.positions = restored
            log.info("Restored %d position(s) from disk", len(self.positions))
        else:
            for ticker in Config.TICKERS:
                self.positions[ticker] = TickerPosition(
                    ticker=ticker, direction=self._direction
                )

        await self.telegram.start()
        await self.telegram.send(
            "🚀 <b>ChartSpyder AI started</b>\n"
            f"Tickers: {', '.join(Config.TICKERS)}\n"
            f"Direction: {self._direction.value}"
        )

    async def shutdown(self) -> None:
        await self.persistence.save(self.positions)
        await self.telegram.stop()
        await self.broker.logout()

    async def run(self) -> None:
        """Main scan loop — runs every SCAN_INTERVAL_SECONDS."""
        log.info("Engine scan loop started (interval=%ds)", Config.SCAN_INTERVAL_SECONDS)
        while True:
            try:
                await self._scan_all()
            except Exception as exc:
                log.error("Scan cycle error: %s", exc, exc_info=True)
            await asyncio.sleep(Config.SCAN_INTERVAL_SECONDS)

    # ── Per-ticker scan ───────────────────────────────────────────────────

    async def _scan_all(self) -> None:
        for ticker, pos in self.positions.items():
            price = await self.broker.get_latest_price(ticker)
            if price <= 0:
                log.warning("[%s] Could not fetch price — skipping", ticker)
                continue
            closes = await self.broker.get_price_history(ticker)

            # D11 — shadow trader evaluation runs regardless of live state
            self.shadow.evaluate(ticker, price)

            if pos.state == TradeState.FROZEN or self.is_globally_frozen:
                continue

            if pos.state == TradeState.IDLE:
                await self._check_entry(pos, price, closes)
            elif pos.state == TradeState.ACTIVE:
                await self._manage_active(pos, price, closes)
            elif pos.state == TradeState.TRAILING:
                await self._manage_trailing(pos, price)

    # ── IDLE → ACTIVE ─────────────────────────────────────────────────────

    async def _check_entry(self, pos: TickerPosition, price: float, closes: List[float]) -> None:
        """
        Entry condition: simplified example — enter whenever IDLE.
        Replace with your desired entry signal (EMA cross, support bounce, etc.)
        """
        # B4 — volume gate
        if not await self.volume_filter.passes(pos.ticker):
            return

        # C7 — RSI gate on entry (don't enter an overbought asset long)
        if self.rsi_filter.should_suspend_dca(closes, pos.direction):
            log.info("[%s] RSI filter blocking entry", pos.ticker)
            return

        base_usd = await self.sizer.base_order_usd()   # C8

        log.info("[%s] Entry signal — placing base order $%.2f @ %.4f", pos.ticker, base_usd, price)

        # B6 — chop large orders
        order_ids = await self.chopper.execute(
            pos.ticker, base_usd, price, "buy" if pos.direction == MarketDirection.LONG else "sell",
            pos.direction,
        )
        filled_qty = base_usd / price

        # Update position
        pos.average_entry = price
        pos.total_quantity = filled_qty
        pos.total_invested_usd = base_usd
        pos.entered_at = datetime.utcnow()
        pos.stop_loss_price = (
            price * (1 - Config.STOP_LOSS_PCT / 100)
            if pos.direction == MarketDirection.LONG
            else price * (1 + Config.STOP_LOSS_PCT / 100)
        )
        pos.breakeven_moved = False

        # Place DCA safety orders
        await self._place_safety_orders(pos, price, base_usd)

        pos.transition(TradeState.ACTIVE)
        await self.persistence.save(self.positions)

        # D11
        self.shadow.open_trade(pos.ticker, pos.direction.value, price, filled_qty)

        await self.telegram.notify_entry(pos.ticker, price, filled_qty, pos.direction.value)

    async def _place_safety_orders(
        self, pos: TickerPosition, entry_price: float, base_usd: float
    ) -> None:
        """Place all DCA safety limit orders below (LONG) or above (SHORT) entry."""
        pos.safety_orders.clear()
        for step in range(1, Config.SAFETY_ORDER_STEPS + 1):
            step_pct = Config.SAFETY_STEP_PCT * step
            if pos.direction == MarketDirection.LONG:
                trigger = entry_price * (1 - step_pct / 100)
            else:
                trigger = entry_price * (1 + step_pct / 100)
            size_usd = await self.sizer.safety_order_usd(step, base_usd)
            oid = await self.broker.place_limit_order(
                pos.ticker, size_usd, trigger,
                "buy" if pos.direction == MarketDirection.LONG else "sell",
            )
            so = SafetyOrder(
                step=step,
                trigger_price=trigger,
                order_size_usd=size_usd,
                order_id=oid,
                placed_at=datetime.utcnow(),
            )
            pos.safety_orders.append(so)
            log.info(
                "[%s] Safety step %d placed @ %.4f  $%.2f  id=%s",
                pos.ticker, step, trigger, size_usd, oid,
            )

    # ── ACTIVE state management ───────────────────────────────────────────

    async def _manage_active(
        self, pos: TickerPosition, price: float, closes: List[float]
    ) -> None:
        # A1 — breakeven auto-adjust
        self.breakeven.evaluate(pos, price)

        # B5 — expire stale safety orders
        purged = await self.expiration_mgr.purge_stale(pos)
        if purged:
            await self._place_safety_orders(pos, pos.average_entry, pos.total_invested_usd)

        # C7 — RSI filter for DCA suspension flag
        pos.safety_orders_suspended = self.rsi_filter.should_suspend_dca(closes, pos.direction)

        # Check if any safety orders should be simulated as filled (paper mode)
        await self._simulate_safety_fills(pos, price)

        # Stop-loss check
        stop_hit = (
            (pos.direction == MarketDirection.LONG and price <= pos.stop_loss_price)
            or (pos.direction == MarketDirection.SHORT and price >= pos.stop_loss_price)
        )
        if stop_hit:
            await self._close_position(pos, price, reason="STOP LOSS")
            return

        # Take-profit → transition to TRAILING
        tp_hit = pos.profit_pct(price) >= Config.TAKE_PROFIT_PCT
        if tp_hit:
            pos.peak_price = price
            pos.trailing_stop_price = (
                price * (1 - Config.TRAILING_STOP_PCT / 100)
                if pos.direction == MarketDirection.LONG
                else price * (1 + Config.TRAILING_STOP_PCT / 100)
            )
            pos.transition(TradeState.TRAILING)
            await self.persistence.save(self.positions)
            await self.telegram.notify_state(
                pos.ticker, "ACTIVE", "TRAILING",
                f"Take-profit reached at {price:.4f} — trailing stop armed at {pos.trailing_stop_price:.4f}",
            )

    async def _simulate_safety_fills(self, pos: TickerPosition, price: float) -> None:
        """In paper mode, simulate safety order fills when price crosses trigger."""
        for so in pos.safety_orders:
            if so.status != "pending":
                continue
            if pos.safety_orders_suspended:
                break
            filled = (
                (pos.direction == MarketDirection.LONG and price <= so.trigger_price)
                or (pos.direction == MarketDirection.SHORT and price >= so.trigger_price)
            )
            if filled:
                qty = so.order_size_usd / so.trigger_price
                total_qty = pos.total_quantity + qty
                pos.average_entry = (
                    pos.average_entry * pos.total_quantity + so.trigger_price * qty
                ) / total_qty
                pos.total_quantity = total_qty
                pos.total_invested_usd += so.order_size_usd
                # Reset breakeven for new avg entry
                pos.breakeven_moved = False
                pos.stop_loss_price = (
                    pos.average_entry * (1 - Config.STOP_LOSS_PCT / 100)
                    if pos.direction == MarketDirection.LONG
                    else pos.average_entry * (1 + Config.STOP_LOSS_PCT / 100)
                )
                so.status = "filled"
                so.filled_at = datetime.utcnow()
                log.info(
                    "[%s] Safety step %d filled @ %.4f — new avg entry %.4f",
                    pos.ticker, so.step, so.trigger_price, pos.average_entry,
                )
                await self.persistence.save(self.positions)

    # ── TRAILING state management ─────────────────────────────────────────

    async def _manage_trailing(self, pos: TickerPosition, price: float) -> None:
        # Update peak / trail
        if pos.direction == MarketDirection.LONG:
            if price > pos.peak_price:
                pos.peak_price = price
                pos.trailing_stop_price = price * (1 - Config.TRAILING_STOP_PCT / 100)
            hit = price <= pos.trailing_stop_price
        else:
            if price < pos.peak_price:
                pos.peak_price = price
                pos.trailing_stop_price = price * (1 + Config.TRAILING_STOP_PCT / 100)
            hit = price >= pos.trailing_stop_price

        if hit:
            await self._close_position(pos, price, reason="TRAILING STOP")

    # ── Position close ────────────────────────────────────────────────────

    async def _close_position(
        self, pos: TickerPosition, price: float, reason: str = "CLOSE"
    ) -> None:
        pnl = pos.unrealised_pnl(price)
        log.info("[%s] Closing position (%s)  pnl=%+.2f", pos.ticker, reason, pnl)

        # Cancel remaining open safety orders
        for so in pos.safety_orders:
            if so.status == "pending" and so.order_id:
                await self.broker.cancel_order(so.order_id)
                so.status = "cancelled"

        # Execute closing order (reversed side vs. entry direction)
        close_side = "sell" if pos.direction == MarketDirection.LONG else "buy"
        await self.chopper.execute(
            pos.ticker,
            pos.total_invested_usd + pnl,
            price,
            close_side,
            pos.direction,
        )

        await self.telegram.notify_exit(pos.ticker, price, pnl)

        # A2 — greed circuit check on realised profit
        if self.greed_circuit.record(pnl):
            self.is_globally_frozen = True
            for p in self.positions.values():
                p.transition(TradeState.FROZEN)
            await self.telegram.notify_freeze(
                f"Daily profit cap ${Config.MAX_DAILY_PROFIT_USD:.2f} reached — bot FROZEN"
            )

        # Reset position
        pos.average_entry = 0.0
        pos.total_quantity = 0.0
        pos.total_invested_usd = 0.0
        pos.safety_orders.clear()
        pos.breakeven_moved = False
        pos.entered_at = None
        pos.transition(TradeState.IDLE if not self.is_globally_frozen else TradeState.FROZEN)
        await self.persistence.save(self.positions)

    # ── Emergency liquidation (A3 /liquidate) ────────────────────────────

    async def liquidate_all(self, reason: str = "manual") -> int:
        count = 0
        for ticker, pos in self.positions.items():
            if pos.state in (TradeState.ACTIVE, TradeState.TRAILING):
                price = await self.broker.get_latest_price(ticker)
                if price > 0:
                    await self._close_position(pos, price, reason=f"LIQUIDATE:{reason}")
                    count += 1
        self.is_globally_frozen = True
        for pos in self.positions.values():
            pos.transition(TradeState.FROZEN)
        await self.persistence.save(self.positions)
        return count

    # ── NAV calculation (D12 heartbeat) ──────────────────────────────────

    async def calculate_nav(self) -> float:
        cash = await self.broker.get_cash_balance()
        position_value = 0.0
        for ticker, pos in self.positions.items():
            if pos.total_quantity > 0:
                price = await self.broker.get_latest_price(ticker)
                position_value += price * pos.total_quantity
        return cash + position_value


# ── FastAPI Application ────────────────────────────────────────────────────────

engine = TradingEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hook tied to the FastAPI lifecycle."""
    await engine.initialize()
    # Launch background tasks
    scan_task = asyncio.create_task(engine.run(), name="scan-loop")
    heartbeat_task = asyncio.create_task(
        engine.telegram.heartbeat_loop(), name="heartbeat"
    )
    yield
    scan_task.cancel()
    heartbeat_task.cancel()
    await engine.shutdown()


app = FastAPI(
    title="ChartSpyder AI",
    version="2.0.0",
    description="Enterprise multi-ticker async trading engine",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int((datetime.utcnow() - engine.telegram._start_time).total_seconds()),
        "globally_frozen": engine.is_globally_frozen,
        "direction": Config.MARKET_DIRECTION,
        "daily_profit_usd": round(engine.greed_circuit.daily_total(), 2),
    }


@app.get("/positions")
async def get_positions():
    return {
        ticker: pos.to_dict()
        for ticker, pos in engine.positions.items()
    }


@app.get("/shadow")
async def get_shadow():
    return engine.shadow.summary()


@app.post("/freeze")
async def freeze():
    engine.is_globally_frozen = True
    for pos in engine.positions.values():
        if pos.state != TradeState.FROZEN:
            pos.transition(TradeState.FROZEN)
    await engine.persistence.save(engine.positions)
    await engine.telegram.send("🧊 Bot FROZEN via API call")
    return {"status": "frozen"}


@app.post("/unfreeze")
async def unfreeze():
    engine.is_globally_frozen = False
    for pos in engine.positions.values():
        if pos.state == TradeState.FROZEN:
            pos.transition(TradeState.IDLE)
    await engine.persistence.save(engine.positions)
    await engine.telegram.send("✅ Bot UNFROZEN via API call")
    return {"status": "unfrozen"}


@app.post("/liquidate")
async def api_liquidate():
    count = await engine.liquidate_all(reason="HTTP API /liquidate")
    return {"liquidated": count, "status": "frozen"}


@app.get("/nav")
async def get_nav():
    nav = await engine.calculate_nav()
    return {"nav_usd": round(nav, 2)}


@app.delete("/state-backup")
async def clear_state_backup():
    if os.path.exists(Config.STATE_BACKUP_FILE):
        os.remove(Config.STATE_BACKUP_FILE)
    return {"cleared": True}


# ── Entry Point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "bot:app",
        host="127.0.0.1",
        port=int(os.getenv("BOT_PORT", "8081")),
        log_level="info",
        reload=False,
    )
