/**
 * AlphaPulse AI — Professional ECharts Candlestick + AI Forecast Chart
 *
 * Renders:
 *  - Real OHLCV candlestick chart (main pane)
 *  - Volume histogram (lower pane)
 *  - AI Forecast path + confidence band (right of NOW divider)
 *  - Predicted OHLC candle (semi-transparent)
 *  - NOW vertical divider
 *  - Buy/Sell/Hold markers on candles
 *  - Entry / Target 1 / Target 2 / Stop Loss horizontal levels
 *  - Technical indicator overlays (EMA9/21/50, VWAP, Bollinger Bands)
 *  - RSI and MACD in sub-panes
 *  - Forecast history (past predictions vs actuals)
 *  - Professional crosshair tooltip
 */

import { useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption, CallbackDataParams } from 'echarts';
import { useChartStore } from '@/store/chartStore';
import type { Candle, ForecastData, SignalData, IndicatorData, OverlayToggles, HistoricalForecast } from '@/types';

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  textMuted: '#8b949e',
  green: '#26a641',
  greenLight: '#3fb950',
  red: '#da3633',
  redLight: '#f85149',
  amber: '#d29922',
  blue: '#58a6ff',
  purple: '#bc8cff',
  cyan: '#79c0ff',
  // Candle colors
  bullishBody: '#26a641',
  bullishWick: '#3fb950',
  bearishBody: '#da3633',
  bearishWick: '#f85149',
  // Forecast
  forecastUp: '#3fb950',
  forecastDown: '#f85149',
  forecastNeutral: '#d29922',
  confidenceFill: 'rgba(88, 166, 255, 0.12)',
  nowLine: '#58a6ff',
  volumeBull: 'rgba(38, 166, 65, 0.6)',
  volumeBear: 'rgba(218, 54, 51, 0.6)',
  ema9: '#79c0ff',
  ema21: '#d2a8ff',
  ema50: '#ffa657',
  vwap: '#ffdf5d',
  bbUpper: 'rgba(88, 166, 255, 0.5)',
  bbLower: 'rgba(88, 166, 255, 0.5)',
  bbFill: 'rgba(88, 166, 255, 0.04)',
  rsi: '#d2a8ff',
  macd: '#79c0ff',
  macdSignal: '#ffa657',
  macdHist: '#3fb950',
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatPrice(v: number): string {
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return ts;
  }
}
function pct(a: number, b: number): string {
  if (!b) return '0.00%';
  return ((a - b) / b * 100).toFixed(2) + '%';
}

// ─── Main chart builder ───────────────────────────────────────────────────────

interface BuildChartOptions {
  candles: Candle[];
  forecast: ForecastData | null;
  signal: SignalData | null;
  indicators: IndicatorData | null;
  overlays: OverlayToggles;
  forecastHistory: HistoricalForecast[];
}

export function buildChartOption(opts: BuildChartOptions): EChartsOption {
  const { candles, forecast, signal, indicators, overlays, forecastHistory } = opts;

  if (!candles.length) {
    return {
      backgroundColor: COLORS.bg,
      graphic: [{
        type: 'text',
        left: 'center',
        top: 'middle',
        style: { text: 'Fetching live market data…', fill: COLORS.textMuted, fontSize: 16 },
      }],
    };
  }

  // ─── Build axis timestamps ─────────────────────────────────────────────────
  const actualTimestamps = candles.map((c) => c.timestamp);
  const forecastTimestamps: string[] = forecast
    ? forecast.path.map((p) => p.timestamp)
    : [];

  const allTimestamps = [...actualTimestamps, ...forecastTimestamps];
  const nowIndex = actualTimestamps.length - 1;

  // ─── Candlestick data (ECharts format: [open, close, low, high]) ───────────
  const candleData = candles.map((c) => [c.open, c.close, c.low, c.high]);

  // ─── Volume data ───────────────────────────────────────────────────────────
  const volumeData = candles.map((c) => ({
    value: c.volume,
    itemStyle: { color: c.is_bullish ? COLORS.volumeBull : COLORS.volumeBear },
  }));

  // ─── AI Forecast path data ─────────────────────────────────────────────────
  const forecastLineData: (number | null)[] = [];
  const confUpperData: (number | null)[] = [];
  const confLowerData: (number | null)[] = [];

  if (forecast && overlays.aiForecast) {
    // Fill nulls for actual candle range, then add forecast points
    for (let i = 0; i < actualTimestamps.length; i++) {
      forecastLineData.push(null);
      confUpperData.push(null);
      confLowerData.push(null);
    }
    // Anchor the first forecast point to current price for smooth visual join
    forecastLineData[nowIndex] = forecast.current_price;
    confUpperData[nowIndex] = forecast.current_price;
    confLowerData[nowIndex] = forecast.current_price;

    forecast.path.forEach((p) => {
      forecastLineData.push(p.predicted_price);
      confUpperData.push(p.confidence_upper);
      confLowerData.push(p.confidence_lower);
    });
  }

  // ─── Forecast color by direction ───────────────────────────────────────────
  const fColor =
    forecast?.direction === 'UP'
      ? COLORS.forecastUp
      : forecast?.direction === 'DOWN'
      ? COLORS.forecastDown
      : COLORS.forecastNeutral;

  // ─── Indicator series ──────────────────────────────────────────────────────
  const indicatorSeries: echarts.SeriesOption[] = [];

  if (indicators) {
    const mkLine = (name: string, data: (number | null)[], color: string, width = 1) => ({
      name,
      type: 'line' as const,
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: [...data, ...Array(forecastTimestamps.length).fill(null)],
      smooth: false,
      showSymbol: false,
      lineStyle: { color, width, opacity: 0.85 },
      zlevel: 1,
    });

    if (overlays.ema9) indicatorSeries.push(mkLine('EMA 9', indicators.ema_9, COLORS.ema9));
    if (overlays.ema21) indicatorSeries.push(mkLine('EMA 21', indicators.ema_21, COLORS.ema21));
    if (overlays.ema50) indicatorSeries.push(mkLine('EMA 50', indicators.ema_50, COLORS.ema50, 1.5));
    if (overlays.vwap) indicatorSeries.push(mkLine('VWAP', indicators.vwap, COLORS.vwap, 1.5));

    if (overlays.bollingerBands) {
      indicatorSeries.push(mkLine('BB Upper', indicators.bb_upper, COLORS.bbUpper, 1));
      indicatorSeries.push(mkLine('BB Middle', indicators.bb_middle, COLORS.vwap, 1));
      indicatorSeries.push(mkLine('BB Lower', indicators.bb_lower, COLORS.bbLower, 1));
    }
  }

  // ─── RSI data ──────────────────────────────────────────────────────────────
  const rsiData: (number | null)[] = indicators
    ? [...indicators.rsi, ...Array(forecastTimestamps.length).fill(null)]
    : [];

  // ─── MACD data ─────────────────────────────────────────────────────────────
  const macdData: (number | null)[] = indicators
    ? [...indicators.macd, ...Array(forecastTimestamps.length).fill(null)]
    : [];
  const macdSignalData: (number | null)[] = indicators
    ? [...indicators.macd_signal, ...Array(forecastTimestamps.length).fill(null)]
    : [];
  const macdHistData: (number | null)[] = indicators
    ? [...indicators.macd_hist, ...Array(forecastTimestamps.length).fill(null)]
    : [];

  // ─── Buy/Sell markers ─────────────────────────────────────────────────────
  const signalMarkPoints: echarts.MarkPointComponentOption['data'] = [];
  if (signal && overlays.signals && signal.signal !== 'HOLD') {
    const lastCandle = candles[candles.length - 1];
    if (signal.signal === 'BUY') {
      signalMarkPoints.push({
        name: 'BUY',
        coord: [lastCandle.timestamp, lastCandle.low * 0.998],
        value: `▲ BUY\n₹${formatPrice(signal.entry_price)}`,
        itemStyle: { color: COLORS.greenLight },
        label: {
          formatter: '▲ BUY',
          color: COLORS.greenLight,
          fontSize: 11,
          fontWeight: 'bold',
        },
        symbol: 'triangle',
        symbolSize: [14, 10],
        symbolOffset: [0, 8],
      });
    } else if (signal.signal === 'SELL') {
      signalMarkPoints.push({
        name: 'SELL',
        coord: [lastCandle.timestamp, lastCandle.high * 1.002],
        value: `▼ SELL\n₹${formatPrice(signal.entry_price)}`,
        itemStyle: { color: COLORS.redLight },
        label: {
          formatter: '▼ SELL',
          color: COLORS.redLight,
          fontSize: 11,
          fontWeight: 'bold',
        },
        symbol: 'triangle',
        symbolSize: [14, 10],
        symbolOffset: [0, -8],
        symbolRotate: 180,
      });
    }
  }

  // Past forecast history markers
  if (overlays.forecastHistory) {
    forecastHistory.forEach((h) => {
      if (h.was_correct === undefined) return;
      const c = candles[h.candle_index];
      if (!c) return;
      signalMarkPoints.push({
        name: h.was_correct ? '✓' : '✕',
        coord: [c.timestamp, h.was_correct ? c.low * 0.997 : c.high * 1.003],
        value: h.was_correct ? '✓' : '✕',
        itemStyle: { color: h.was_correct ? COLORS.green : COLORS.red },
        symbol: 'circle',
        symbolSize: 8,
        label: {
          formatter: h.was_correct ? '✓' : '✕',
          color: h.was_correct ? COLORS.greenLight : COLORS.redLight,
          fontSize: 10,
        },
      });
    });
  }

  // ─── Horizontal level marklines (Entry / Targets / Stop) ─────────────────
  const markLineData: echarts.MarkLineComponentOption['data'] = [];

  if (signal && signal.signal !== 'HOLD') {
    if (overlays.targets && signal.target_1 > 0) {
      markLineData.push([
        { name: `TARGET 1  ₹${formatPrice(signal.target_1)}`, yAxis: signal.target_1, x: '10%',
          lineStyle: { color: COLORS.greenLight, type: 'dashed', width: 1 },
          label: { formatter: `T1 ₹${formatPrice(signal.target_1)}`, position: 'insideStartTop', color: COLORS.greenLight, fontSize: 10 } },
        { yAxis: signal.target_1, x: '90%' },
      ]);
      markLineData.push([
        { name: `TARGET 2  ₹${formatPrice(signal.target_2)}`, yAxis: signal.target_2, x: '10%',
          lineStyle: { color: COLORS.green, type: 'dashed', width: 1 },
          label: { formatter: `T2 ₹${formatPrice(signal.target_2)}`, position: 'insideStartTop', color: COLORS.green, fontSize: 10 } },
        { yAxis: signal.target_2, x: '90%' },
      ]);
    }

    if (overlays.stopLoss && signal.stop_loss > 0) {
      markLineData.push([
        { name: `STOP ₹${formatPrice(signal.stop_loss)}`, yAxis: signal.stop_loss, x: '10%',
          lineStyle: { color: COLORS.redLight, type: 'dashed', width: 1 },
          label: { formatter: `SL ₹${formatPrice(signal.stop_loss)}`, position: 'insideStartTop', color: COLORS.redLight, fontSize: 10 } },
        { yAxis: signal.stop_loss, x: '90%' },
      ]);
    }

    if (forecast && overlays.aiForecast) {
      markLineData.push([
        { name: `AI FORECAST ₹${formatPrice(forecast.target_price)}`, yAxis: forecast.target_price, x: '10%',
          lineStyle: { color: fColor, type: 'dotted', width: 1.5 },
          label: { formatter: `AI ₹${formatPrice(forecast.target_price)}`, position: 'insideStartTop', color: fColor, fontSize: 10 } },
        { yAxis: forecast.target_price, x: '90%' },
      ]);
    }
  }

  // ─── Determine chart grid layout ──────────────────────────────────────────
  const showRsi = overlays.rsi && rsiData.length > 0;
  const showMacd = overlays.macd && macdData.length > 0;
  const showVolume = overlays.volume;

  // Grid proportions (main chart gets most of the space)
  let mainBottom = '2%';
  let extraGrids = 0;
  const subGridHeight = 12; // % each sub-pane

  if (showVolume) { mainBottom = `${parseInt(mainBottom) + subGridHeight}%`; extraGrids++; }
  if (showRsi) { mainBottom = `${parseInt(mainBottom) + subGridHeight}%`; extraGrids++; }
  if (showMacd) { mainBottom = `${parseInt(mainBottom) + subGridHeight}%`; extraGrids++; }

  const grids: echarts.GridComponentOption[] = [
    {
      id: 'main',
      top: '6%',
      left: '1%',
      right: '4%',
      bottom: mainBottom,
      containLabel: true,
    },
  ];

  let currentBottom = 2;
  const volumeGridIndex = extraGrids > 0 ? 1 : -1;
  const rsiGridIndex = showRsi ? (showVolume ? 2 : 1) : -1;
  const macdGridIndex = showMacd ? (showVolume && showRsi ? 3 : showVolume || showRsi ? 2 : 1) : -1;

  if (showVolume) {
    grids.push({ top: `${100 - currentBottom - subGridHeight}%`, left: '1%', right: '4%', height: `${subGridHeight - 1}%`, containLabel: true });
    currentBottom += subGridHeight;
  }
  if (showRsi) {
    grids.push({ top: `${100 - currentBottom - subGridHeight}%`, left: '1%', right: '4%', height: `${subGridHeight - 1}%`, containLabel: true });
    currentBottom += subGridHeight;
  }
  if (showMacd) {
    grids.push({ top: `${100 - currentBottom - subGridHeight}%`, left: '1%', right: '4%', height: `${subGridHeight - 1}%`, containLabel: true });
  }

  // ─── X Axes ───────────────────────────────────────────────────────────────
  const xAxes: echarts.XAXisComponentOption[] = [
    {
      gridIndex: 0,
      type: 'category',
      data: allTimestamps,
      axisLabel: {
        formatter: (v: string) => formatTs(v),
        color: COLORS.textMuted,
        fontSize: 10,
        showMaxLabel: true,
      },
      axisLine: { lineStyle: { color: COLORS.border } },
      splitLine: { show: false },
      boundaryGap: true,
    },
  ];

  if (showVolume) {
    xAxes.push({
      gridIndex: volumeGridIndex,
      type: 'category',
      data: allTimestamps,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: COLORS.border } },
      splitLine: { show: false },
      boundaryGap: true,
    });
  }
  if (showRsi) {
    xAxes.push({
      gridIndex: rsiGridIndex,
      type: 'category',
      data: allTimestamps,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: COLORS.border } },
      splitLine: { show: false },
      boundaryGap: true,
    });
  }
  if (showMacd) {
    xAxes.push({
      gridIndex: macdGridIndex,
      type: 'category',
      data: allTimestamps,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: COLORS.border } },
      splitLine: { show: false },
      boundaryGap: true,
    });
  }

  // ─── Y Axes ───────────────────────────────────────────────────────────────
  const allPrices = candles.flatMap((c) => [c.high, c.low]);
  if (forecast) {
    allPrices.push(forecast.target_price, ...forecast.path.map((p) => p.confidence_upper), ...forecast.path.map((p) => p.confidence_lower));
    if (signal) {
      if (signal.target_2 > 0) allPrices.push(signal.target_2);
      if (signal.stop_loss > 0) allPrices.push(signal.stop_loss);
    }
  }
  const minPrice = Math.min(...allPrices) * 0.998;
  const maxPrice = Math.max(...allPrices) * 1.002;

  const yAxes: echarts.YAXisComponentOption[] = [
    {
      gridIndex: 0,
      type: 'value',
      min: minPrice,
      max: maxPrice,
      splitNumber: 6,
      axisLabel: {
        formatter: (v: number) => `₹${v.toFixed(0)}`,
        color: COLORS.textMuted,
        fontSize: 10,
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: COLORS.border, type: 'dashed', opacity: 0.4 } },
      position: 'right',
    },
  ];

  if (showVolume) {
    yAxes.push({
      gridIndex: volumeGridIndex,
      type: 'value',
      axisLabel: { show: false },
      axisLine: { show: false },
      splitLine: { show: false },
    });
  }
  if (showRsi) {
    yAxes.push({
      gridIndex: rsiGridIndex,
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}', color: COLORS.textMuted, fontSize: 9 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: COLORS.border, opacity: 0.3 } },
    });
  }
  if (showMacd) {
    yAxes.push({
      gridIndex: macdGridIndex,
      type: 'value',
      axisLabel: { formatter: (v: number) => v.toFixed(1), color: COLORS.textMuted, fontSize: 9 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: COLORS.border, opacity: 0.3 } },
    });
  }

  // ─── Mark the NOW divider using visualMap or markLine on candleSeries ─────
  const nowMarkLine: echarts.MarkLineComponentOption = {
    silent: false,
    animation: true,
    data: [
      {
        name: 'NOW',
        xAxis: actualTimestamps[nowIndex],
        lineStyle: { color: COLORS.nowLine, width: 2, type: 'solid' },
        label: {
          show: true,
          formatter: '◆ NOW',
          color: COLORS.nowLine,
          fontSize: 11,
          fontWeight: 'bold',
          position: 'insideEndTop',
          backgroundColor: COLORS.bg,
          padding: [2, 6],
          borderRadius: 3,
        },
      },
    ],
  };

  // ─── Series ───────────────────────────────────────────────────────────────
  const series: echarts.SeriesOption[] = [
    // 1. Candlestick (main)
    {
      name: 'Price',
      type: 'candlestick',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: candleData,
      itemStyle: {
        color: COLORS.bullishBody,
        color0: COLORS.bearishBody,
        borderColor: COLORS.bullishWick,
        borderColor0: COLORS.bearishWick,
      },
      markPoint: {
        data: signalMarkPoints,
        symbolSize: [18, 12],
        label: { color: COLORS.text, fontSize: 10, fontWeight: 'bold' },
      },
      markLine: {
        ...nowMarkLine,
        data: [...nowMarkLine.data!, ...markLineData],
      },
    },

    // 2. Indicator overlays
    ...indicatorSeries,
  ];

  // 3. AI Forecast line
  if (forecast && overlays.aiForecast && forecastLineData.length) {
    series.push({
      name: 'AI Forecast',
      type: 'line',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: forecastLineData,
      showSymbol: true,
      symbolSize: (_val: unknown, params: { dataIndex: number }) => {
        // Only show symbol at the final forecast point
        return params.dataIndex === forecastLineData.length - 1 ? 10 : 0;
      },
      smooth: true,
      lineStyle: {
        color: fColor,
        width: 2.5,
        type: 'dashed',
        shadowColor: fColor,
        shadowBlur: 6,
      },
      itemStyle: { color: fColor },
      zlevel: 5,
      label: {
        show: false,
      },
      endLabel: {
        show: true,
        formatter: (params: CallbackDataParams) => {
          const v = Array.isArray(params.value) ? params.value[0] : params.value;
          return `● AI\n₹${formatPrice(Number(v ?? 0))}`;
        },
        color: fColor,
        fontSize: 10,
        fontWeight: 'bold' as const,
      },
    });

    // Confidence band upper
    if (overlays.confidenceBand) {
      series.push({
        name: 'Conf Upper',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: confUpperData,
        showSymbol: false,
        smooth: true,
        lineStyle: { color: 'transparent', width: 0 },
        areaStyle: {
          color: COLORS.confidenceFill,
          origin: 'start',
        },
        stack: 'confidence',
        zlevel: 3,
      });

      // Confidence band lower (filled between upper and lower)
      series.push({
        name: 'Conf Lower',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: confLowerData,
        showSymbol: false,
        smooth: true,
        lineStyle: { color: 'rgba(88,166,255,0.25)', width: 1, type: 'dotted' },
        areaStyle: {
          color: COLORS.bg,
          origin: 'start',
        },
        stack: 'confidence',
        zlevel: 3,
      });
    }

    // Predicted OHLC candle (last forecast point)
    if (forecast.predicted_candle_open && forecast.predicted_candle_close) {
      const predTs = forecast.path[forecast.path.length - 1]?.timestamp;
      if (predTs) {
        const predData = allTimestamps.map((ts) =>
          ts === predTs
            ? [
                forecast.predicted_candle_open,
                forecast.predicted_candle_close,
                forecast.predicted_candle_low,
                forecast.predicted_candle_high,
              ]
            : ['-', '-', '-', '-']
        );
        series.push({
          name: 'AI Predicted Candle',
          type: 'candlestick',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: predData as number[][],
          itemStyle: {
            color: `${fColor}55`,
            color0: `${COLORS.bearishBody}55`,
            borderColor: fColor,
            borderColor0: COLORS.bearishWick,
            opacity: 0.7,
          },
          zlevel: 4,
        });
      }
    }
  }

  // Track sub-pane axis indices: axes are pushed in the same order as grids
  let _subAxisIdx = 1; // 0 is main; sub-panes start at 1
  const volAxisIdx = showVolume ? _subAxisIdx++ : -1;
  const rsiAxisIdx = showRsi ? _subAxisIdx++ : -1;
  const macdAxisIdx = showMacd ? _subAxisIdx : -1;

  // 4. Volume (sub-pane)
  if (showVolume && volAxisIdx >= 0) {
    series.push({
      name: 'Volume',
      type: 'bar',
      xAxisIndex: volAxisIdx,
      yAxisIndex: volAxisIdx,
      data: [
        ...volumeData,
        ...Array(forecastTimestamps.length).fill({ value: 0, itemStyle: { color: 'transparent' } }),
      ],
      barMaxWidth: 8,
      zlevel: 2,
    });
  }

  // 5. RSI
  if (showRsi && rsiAxisIdx >= 0) {
    series.push({
      name: 'RSI',
      type: 'line',
      xAxisIndex: rsiAxisIdx,
      yAxisIndex: rsiAxisIdx,
      data: rsiData,
      showSymbol: false,
      lineStyle: { color: COLORS.rsi, width: 1.5 },
      areaStyle: { color: `${COLORS.rsi}1a` },
    });
  }

  // 6. MACD
  if (showMacd && macdAxisIdx >= 0) {
    const macdXIdx = macdAxisIdx;
    const macdYIdx = macdAxisIdx;
    series.push({
      name: 'MACD',
      type: 'line',
      xAxisIndex: macdXIdx,
      yAxisIndex: macdYIdx,
      data: macdData,
      showSymbol: false,
      lineStyle: { color: COLORS.macd, width: 1.5 },
    });
    series.push({
      name: 'MACD Signal',
      type: 'line',
      xAxisIndex: macdXIdx,
      yAxisIndex: macdYIdx,
      data: macdSignalData,
      showSymbol: false,
      lineStyle: { color: COLORS.macdSignal, width: 1.5 },
    });
    series.push({
      name: 'MACD Hist',
      type: 'bar',
      xAxisIndex: macdXIdx,
      yAxisIndex: macdYIdx,
      data: macdHistData.map((v) => ({
        value: v,
        itemStyle: { color: (v ?? 0) >= 0 ? COLORS.green : COLORS.red },
      })),
      barMaxWidth: 6,
    });
  }

  // ─── Tooltip (crosshair) ──────────────────────────────────────────────────
  const tooltipFormatter = (params: echarts.TooltipComponentFormatterCallbackParams) => {
    if (!Array.isArray(params)) params = [params];
    const main = params.find((p) => p.seriesName === 'Price');
    const volPt = params.find((p) => p.seriesName === 'Volume');
    const rsiPt = params.find((p) => p.seriesName === 'RSI');
    const vwapPt = params.find((p) => p.seriesName === 'VWAP');
    const ts = params[0]?.name ?? '';
    const isForecasted = forecastTimestamps.includes(ts);
    const tsFormatted = (() => {
      try { return new Date(ts).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' }); }
      catch { return ts; }
    })();

    let html = `<div style="font-family:monospace;font-size:11px;line-height:1.6;color:${COLORS.text};min-width:160px;">`;
    html += `<div style="color:${COLORS.textMuted};margin-bottom:4px;">${tsFormatted}</div>`;

    if (isForecasted) {
      const fp = forecast?.path.find((p) => p.timestamp === ts);
      html += `<div style="color:${fColor};font-weight:bold;margin-bottom:4px;">AI FORECAST</div>`;
      if (fp) {
        html += `<div>Expected: <span style="color:${fColor}">₹${formatPrice(fp.predicted_price)}</span></div>`;
        html += `<div>Upper: ₹${formatPrice(fp.confidence_upper)}</div>`;
        html += `<div>Lower: ₹${formatPrice(fp.confidence_lower)}</div>`;
        html += `<div>P(UP): <span style="color:${COLORS.greenLight}">${(fp.probability_up * 100).toFixed(1)}%</span></div>`;
        html += `<div>P(DOWN): <span style="color:${COLORS.redLight}">${(fp.probability_down * 100).toFixed(1)}%</span></div>`;
        html += `<div>Confidence: ${forecast?.confidence_score.toFixed(0)}/100</div>`;
      }
    } else if (main) {
      const [o, c, l, h] = main.value as number[];
      const bull = c >= o;
      const change = pct(c, o);
      html += `<table style="border-collapse:collapse">`;
      html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">O</td><td>₹${formatPrice(o)}</td></tr>`;
      html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">H</td><td>₹${formatPrice(h)}</td></tr>`;
      html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">L</td><td>₹${formatPrice(l)}</td></tr>`;
      html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">C</td><td style="color:${bull ? COLORS.greenLight : COLORS.redLight};font-weight:bold">₹${formatPrice(c)}</td></tr>`;
      html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">Δ</td><td style="color:${bull ? COLORS.greenLight : COLORS.redLight}">${change}</td></tr>`;
      if (volPt) html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">Vol</td><td>${(volPt.value as number / 1_000_000).toFixed(2)}M</td></tr>`;
      if (vwapPt) html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">VWAP</td><td>₹${formatPrice(vwapPt.value as number)}</td></tr>`;
      if (rsiPt) html += `<tr><td style="color:${COLORS.textMuted};padding-right:8px">RSI</td><td>${(rsiPt.value as number).toFixed(1)}</td></tr>`;
      html += `</table>`;
    }

    html += `</div>`;
    return html;
  };

  // ─── Assemble final option ─────────────────────────────────────────────────
  return {
    backgroundColor: COLORS.bg,
    animation: true,
    animationDuration: 300,
    animationEasing: 'cubicOut',
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    series,
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        crossStyle: { color: COLORS.textMuted, width: 1, type: 'dashed' },
        label: {
          backgroundColor: COLORS.surface,
          color: COLORS.text,
          borderColor: COLORS.border,
          fontSize: 10,
        },
      },
      backgroundColor: COLORS.surface,
      borderColor: COLORS.border,
      borderWidth: 1,
      textStyle: { color: COLORS.text, fontSize: 11 },
      formatter: tooltipFormatter,
      confine: true,
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: xAxes.map((_, i) => i),
        start: 60,
        end: 100,
        minValueSpan: 10,
      },
      {
        type: 'slider',
        xAxisIndex: xAxes.map((_, i) => i),
        start: 60,
        end: 100,
        bottom: 0,
        height: 20,
        borderColor: COLORS.border,
        textStyle: { color: COLORS.textMuted, fontSize: 9 },
        fillerColor: 'rgba(88,166,255,0.1)',
        handleStyle: { color: COLORS.blue },
        dataBackground: {
          lineStyle: { color: COLORS.border },
          areaStyle: { color: `${COLORS.surface}aa` },
        },
      },
    ],
    legend: {
      data: [
        overlays.ema9 ? 'EMA 9' : '',
        overlays.ema21 ? 'EMA 21' : '',
        overlays.ema50 ? 'EMA 50' : '',
        overlays.vwap ? 'VWAP' : '',
        overlays.aiForecast ? 'AI Forecast' : '',
      ].filter(Boolean),
      top: 4,
      left: 8,
      textStyle: { color: COLORS.textMuted, fontSize: 10 },
      itemWidth: 14,
      itemHeight: 4,
    },
  } as EChartsOption;
}

// ─── React Component ─────────────────────────────────────────────────────────

export default function CandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  const candles = useChartStore((s) => s.candles);
  const forecast = useChartStore((s) => s.forecast);
  const signal = useChartStore((s) => s.signal);
  const indicators = useChartStore((s) => s.indicators);
  const overlays = useChartStore((s) => s.overlays);
  const forecastHistory = useChartStore((s) => s.forecastHistory);
  const isFullscreen = useChartStore((s) => s.isFullscreen);

  const option = useMemo(
    () => buildChartOption({ candles, forecast, signal, indicators, overlays, forecastHistory }),
    [candles, forecast, signal, indicators, overlays, forecastHistory]
  );

  // Initialize ECharts instance
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Update chart option
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption(option, { notMerge: false, lazyUpdate: false });
  }, [option]);

  // Fullscreen resize
  useEffect(() => {
    if (chartRef.current) {
      setTimeout(() => chartRef.current?.resize(), 100);
    }
  }, [isFullscreen]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 480,
        background: COLORS.bg,
      }}
    />
  );
}
