/**
 * Stock Header — symbol selector, live price, change, timeframe buttons
 */
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useChartStore } from '@/store/chartStore';
import type { Interval } from '@/types';
import styles from './StockHeader.module.css';

const INTERVALS: { value: Interval; label: string }[] = [
  { value: '1m',  label: '1M' },
  { value: '5m',  label: '5M' },
  { value: '15m', label: '15M' },
  { value: '30m', label: '30M' },
  { value: '1h',  label: '1H' },
  { value: '1d',  label: '1D' },
];

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

export default function StockHeader() {
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setInterval = useChartStore((s) => s.setInterval);
  const candles = useChartStore((s) => s.candles);
  const wsStatus = useChartStore((s) => s.wsStatus);
  const isFullscreen = useChartStore((s) => s.isFullscreen);
  const setFullscreen = useChartStore((s) => s.setFullscreen);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastCandle = candles[candles.length - 1] ?? null;
  const prevCandle = candles[candles.length - 2] ?? null;

  const price = lastCandle?.close ?? 0;
  const prevClose = prevCandle?.close ?? lastCandle?.open ?? price;
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const isUp = change >= 0;

  // Search
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const apiBase = import.meta.env.VITE_API_URL ?? '';
        const res = await axios.get<{ results: SearchResult[] }>(`${apiBase}/api/symbols/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.results);
      } catch { setResults([]); }
      setSearching(false);
    }, 350);
  }, [query]);

  function selectSymbol(sym: string) {
    setSymbol(sym.replace('.NS', '').replace('.BO', ''));
    setQuery('');
    setResults([]);
  }

  return (
    <header className={styles.header}>
      {/* Left: symbol + search */}
      <div className={styles.left}>
        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={symbol}
            aria-label="Search stock symbol"
          />
          {results.length > 0 && (
            <div className={styles.dropdown}>
              {results.map((r) => (
                <div
                  key={r.symbol}
                  className={styles.dropdownItem}
                  onClick={() => selectSymbol(r.symbol)}
                >
                  <span className={styles.dropSym}>{r.symbol.replace('.NS', '')}</span>
                  <span className={styles.dropName}>{r.name}</span>
                </div>
              ))}
            </div>
          )}
          {searching && <span className={styles.spinner}>⟳</span>}
        </div>

        {/* Price */}
        {price > 0 && (
          <div className={styles.priceBlock}>
            <span className={styles.price}>
              ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`${styles.change} ${isUp ? styles.up : styles.down}`}>
              {isUp ? '+' : ''}
              {change.toFixed(2)} ({changePct.toFixed(2)}%)
            </span>
          </div>
        )}

        {/* Live badge */}
        <span className={`${styles.liveBadge} ${wsStatus === 'connected' ? styles.liveActive : styles.liveStale}`}>
          ● {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'connecting' ? 'CONNECTING' : 'STALE'}
        </span>
      </div>

      {/* Right: timeframe + fullscreen */}
      <div className={styles.right}>
        <div className={styles.intervalGroup}>
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              className={`${styles.ivBtn} ${interval === iv.value ? styles.ivActive : ''}`}
              onClick={() => setInterval(iv.value)}
            >
              {iv.label}
            </button>
          ))}
        </div>

        <button
          className={styles.fsBtn}
          onClick={() => setFullscreen(!isFullscreen)}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? '⊠' : '⊡'}
        </button>
      </div>
    </header>
  );
}
