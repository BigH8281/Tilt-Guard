from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from io import BytesIO
from typing import Any

from .chart_config import CHART_CONFIGS, TRACKED_SYMBOLS, ChartConfig


@lru_cache(maxsize=1)
def _load_chart_dependencies():
    import matplotlib

    matplotlib.use("Agg")

    import matplotlib.pyplot as plt
    import mplfinance as mpf
    import numpy as np
    import pandas as pd
    import yfinance as yf

    return plt, mpf, np, pd, yf


def _download_history(symbol: str, period: str, interval: str) -> pd.DataFrame:
    _, _, _, _, yf = _load_chart_dependencies()
    ticker = yf.Ticker(symbol)
    frame = ticker.history(period=period, interval=interval, auto_adjust=False, prepost=True)
    if frame.empty:
        raise RuntimeError(f"No chart data returned for {symbol}")
    return frame[["Open", "High", "Low", "Close", "Volume"]].dropna().copy()


def _resample(frame: pd.DataFrame, rule: str) -> pd.DataFrame:
    return frame.resample(rule).agg(
        {
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
            "Volume": "sum",
        }
    ).dropna()


def _session_vwap(frame: pd.DataFrame) -> pd.Series:
    _, _, np, pd, _ = _load_chart_dependencies()
    local = frame.copy()
    local["session"] = local.index.tz_convert("America/New_York").date
    typical = (local["High"] + local["Low"] + local["Close"]) / 3.0
    cumulative_value = (typical * local["Volume"]).groupby(local["session"]).cumsum()
    cumulative_volume = local["Volume"].groupby(local["session"]).cumsum().replace(0, np.nan)
    return (cumulative_value / cumulative_volume).replace({pd.NA: np.nan}).astype(float)


def _pivot_levels(frame: pd.DataFrame) -> tuple[list[float], list[float]]:
    highs: list[float] = []
    lows: list[float] = []
    series = frame.reset_index(drop=True)
    window = 2
    for index in range(window, len(series) - window):
        current_high = series.loc[index, "High"]
        current_low = series.loc[index, "Low"]
        left_high = series.loc[index - window:index - 1, "High"]
        right_high = series.loc[index + 1:index + window, "High"]
        left_low = series.loc[index - window:index - 1, "Low"]
        right_low = series.loc[index + 1:index + window, "Low"]
        if current_high >= max(left_high.max(), right_high.max()):
            highs.append(float(current_high))
        if current_low <= min(left_low.min(), right_low.min()):
            lows.append(float(current_low))
    return highs[-8:], lows[-8:]


def _select_levels(frame: pd.DataFrame, daily_reference: pd.DataFrame) -> list[dict[str, Any]]:
    current = float(frame["Close"].iloc[-1])
    pivot_highs, pivot_lows = _pivot_levels(frame.tail(120))
    higher_candidates = sorted({round(value, 2) for value in pivot_highs if value > current})
    lower_candidates = sorted({round(value, 2) for value in pivot_lows if value < current}, reverse=True)

    levels = [
        {"label": "Current", "price": round(current, 2), "color": "#f8fafc", "style": "-", "weight": 1.2},
    ]

    if len(daily_reference) >= 2:
        prior = daily_reference.iloc[-2]
        levels.extend(
            [
                {"label": "PDH", "price": round(float(prior["High"]), 2), "color": "#38bdf8", "style": "--", "weight": 0.9},
                {"label": "PDL", "price": round(float(prior["Low"]), 2), "color": "#f472b6", "style": "--", "weight": 0.9},
            ]
        )

    if higher_candidates:
        levels.append({"label": "R1", "price": higher_candidates[0], "color": "#34d399", "style": ":", "weight": 0.9})
    if lower_candidates:
        levels.append({"label": "S1", "price": lower_candidates[0], "color": "#fb7185", "style": ":", "weight": 0.9})

    recent_high = round(float(frame["High"].tail(20).max()), 2)
    recent_low = round(float(frame["Low"].tail(20).min()), 2)
    levels.append({"label": "20-bar High", "price": recent_high, "color": "#a78bfa", "style": "-.", "weight": 0.7})
    levels.append({"label": "20-bar Low", "price": recent_low, "color": "#f59e0b", "style": "-.", "weight": 0.7})

    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, float]] = set()
    for level in levels:
        key = (level["label"], level["price"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(level)
    return deduped[:6]


def _build_chart(symbol_label: str, symbol: str, config: ChartConfig) -> dict[str, Any]:
    plt, mpf, _, _, _ = _load_chart_dependencies()
    frame = _download_history(symbol, config.period, config.interval)
    daily_reference = _download_history(symbol, "3mo", "1d")

    if config.resample_rule:
        frame = _resample(frame, config.resample_rule)

    frame = frame.tail(config.bars).copy()
    frame["EMA 8"] = frame["Close"].ewm(span=8).mean()
    frame["EMA 21"] = frame["Close"].ewm(span=21).mean()
    frame["EMA 55"] = frame["Close"].ewm(span=55).mean()

    add_plots = [
        mpf.make_addplot(frame["EMA 8"], color="#7dd3fc", width=0.9),
        mpf.make_addplot(frame["EMA 21"], color="#38bdf8", width=1.0),
        mpf.make_addplot(frame["EMA 55"], color="#818cf8", width=1.1),
    ]

    if config.show_vwap:
        frame["VWAP"] = _session_vwap(frame)
        add_plots.append(mpf.make_addplot(frame["VWAP"], color="#f59e0b", width=1.0))

    levels = _select_levels(frame, daily_reference)
    hlines = [level["price"] for level in levels]
    hcolors = [level["color"] for level in levels]
    hstyles = [level["style"] for level in levels]
    hwidths = [level["weight"] for level in levels]

    style = mpf.make_mpf_style(
        base_mpf_style="nightclouds",
        facecolor="#0b1422",
        edgecolor="#0b1422",
        figcolor="#07111f",
        gridcolor="#22314b",
        gridstyle=":",
        y_on_right=True,
    )

    fig, axes = mpf.plot(
        frame,
        type="candle",
        volume=True,
        addplot=add_plots,
        title=f"{symbol_label} · {config.title}",
        ylabel="Price",
        ylabel_lower="Vol",
        style=style,
        returnfig=True,
        figsize=(7.2, 4.8),
        xrotation=0,
        hlines=dict(hlines=hlines, colors=hcolors, linestyle=hstyles, linewidths=hwidths),
        tight_layout=True,
        datetime_format="%d %b",
    )

    main_ax = axes[0]
    x_position = len(frame) - 1.3
    for offset, level in enumerate(levels):
        main_ax.text(
            x_position,
            level["price"],
            f" {level['label']} {level['price']:.2f}",
            color=level["color"],
            fontsize=7,
            ha="left",
            va="center",
            bbox={"facecolor": "#07111f", "alpha": 0.7, "edgecolor": "none", "pad": 1.2},
        )

    buffer = BytesIO()
    fig.savefig(buffer, format="png", dpi=150, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)

    return {
        "timeframe": config.key,
        "title": config.title,
        "image_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
        "levels": [{"label": level["label"], "price": level["price"]} for level in levels],
        "vwap": config.show_vwap,
    }


def build_chart_pack(symbols: list[str] | None = None, timeframe_keys: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    selected_symbols = {label: TRACKED_SYMBOLS[label] for label in (symbols or list(TRACKED_SYMBOLS.keys())) if label in TRACKED_SYMBOLS}
    selected_timeframes = [config for config in CHART_CONFIGS if timeframe_keys is None or config.key in timeframe_keys]
    charts: dict[str, list[dict[str, Any]]] = {label: [] for label in selected_symbols}

    if not selected_symbols or not selected_timeframes:
        return charts

    with ThreadPoolExecutor(max_workers=min(6, len(selected_symbols) * len(selected_timeframes))) as executor:
        future_map = {}
        for label, symbol in selected_symbols.items():
            for config in selected_timeframes:
                future = executor.submit(_build_chart, label, symbol, config)
                future_map[future] = (label, config.key)

        ordered = {label: {} for label in selected_symbols}
        for future in as_completed(future_map):
            label, timeframe_key = future_map[future]
            ordered[label][timeframe_key] = future.result()

    for label in selected_symbols:
        charts[label] = [ordered[label][config.key] for config in selected_timeframes]
    return charts
