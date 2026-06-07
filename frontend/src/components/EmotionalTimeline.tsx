'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { msToTimestamp } from '@/lib/api';
import type { TimelinePoint } from '@/types';

interface Props {
  onSeek?: (ms: number) => void;
  data: TimelinePoint[];
  durationMs: number;
  peakMs?: number;
  variant?: 'community' | 'personal';
}

const MIN_VIEW_MS = 2000;
const ZOOM_STEP = 0.5;

function valueAtMs(data: TimelinePoint[], ms: number): { value: number | null; ratingCount: number } {
  if (data.length === 0) return { value: null, ratingCount: 0 };
  // Outside the data range entirely — no ratings here
  if (ms < data[0].ms || ms > data[data.length - 1].ms) return { value: null, ratingCount: 0 };
  let lo = 0, hi = data.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (data[mid].ms <= ms) lo = mid; else hi = mid;
  }
  const a = data[lo], b = data[hi];
  // Either bracket is a gap marker → unrated region
  if (a.value === null || b.value === null) return { value: null, ratingCount: 0 };
  if (b.ms === a.ms) return { value: a.value, ratingCount: a.ratingCount };
  const t = Math.max(0, Math.min(1, (ms - a.ms) / (b.ms - a.ms)));
  return {
    value: a.value + (b.value - a.value) * t,
    ratingCount: Math.round(a.ratingCount + (b.ratingCount - a.ratingCount) * t),
  };
}

function filterToDomain(data: TimelinePoint[], start: number, end: number): TimelinePoint[] {
  let firstIdx = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].ms >= start) { firstIdx = Math.max(0, i - 1); break; }
  }
  let lastIdx = data.length - 1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].ms <= end) { lastIdx = Math.min(data.length - 1, i + 1); break; }
  }
  return data.slice(firstIdx, lastIdx + 1);
}

function clampDomain(start: number, end: number, durationMs: number): [number, number] {
  const size = end - start;
  let s = Math.max(0, start);
  let e = s + size;
  if (e > durationMs) { e = durationMs; s = Math.max(0, e - size); }
  return [Math.round(s), Math.round(e)];
}

// Pick round interval ticks that fit nicely in the view
function getNiceTicks(start: number, end: number): number[] {
  const viewMs = end - start;
  // Nice intervals in ms: 10s, 15s, 30s, 1m, 2m, 5m
  const INTERVALS = [10000, 15000, 30000, 60000, 120000, 300000];
  // Pick the coarsest interval that still gives at least 2 internal ticks,
  // or the finest that gives at most 6
  const interval = INTERVALS.find((i) => viewMs / i <= 6) ?? INTERVALS[INTERVALS.length - 1];
  const minGap = interval * 0.25; // don't place a tick too close to start/end

  const ticks: number[] = [start];
  const first = Math.ceil(start / interval) * interval;
  for (let t = first; t < end; t += interval) {
    if (t - start >= minGap && end - t >= minGap) ticks.push(t);
  }
  ticks.push(end);
  return ticks;
}

function CustomXAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) {
  if (!payload) return null;
  return (
    <text x={x} y={(y ?? 0) + 12} textAnchor="middle" fill="#6b7280" fontSize={11} fontFamily="monospace">
      {msToTimestamp(payload.value)}
    </text>
  );
}

interface ChartMouseState {
  isTooltipActive?: boolean;
  activeLabel?: string | number;
  activeCoordinate?: { x: number; y: number };
}

export default function EmotionalTimeline({ data, durationMs, peakMs, variant = 'community', onSeek }: Props) {
  const isPersonal = variant === 'personal';
  const accentColor = isPersonal ? '#ef4444' : '#a855f7';
  const gradientId = isPersonal ? 'personalGradient' : 'sentimentGradient';
  const lineGradientId = isPersonal ? 'personalLineGradient' : 'lineGradient';
  const containerRef = useRef<HTMLDivElement>(null);
  const [domain, setDomain] = useState<[number, number]>([0, durationMs]);
  const [hover, setHover] = useState<{
    ms: number; value: number | null; ratingCount: number;
    mouseX: number; mouseY: number;
    plotTop: number; plotHeight: number;
  } | null>(null);

  // Pan tracking — stores start position and domain snapshot
  const panRef = useRef<{ startX: number; startDomain: [number, number]; innerWidth: number } | null>(null);

  const isFullView = domain[0] === 0 && domain[1] === durationMs;
  const viewMs = domain[1] - domain[0];

  useEffect(() => { setDomain([0, durationMs]); }, [durationMs]);

  const handleChartMouseMove = useCallback((state: ChartMouseState, event: React.MouseEvent<Element>) => {
    if (panRef.current) {
      setHover(null);
      const { startX, startDomain, innerWidth } = panRef.current;
      if (innerWidth > 0) {
        const msPerPx = (startDomain[1] - startDomain[0]) / innerWidth;
        const deltaMs = (event.clientX - startX) * msPerPx;
        setDomain(clampDomain(startDomain[0] - deltaMs, startDomain[1] - deltaMs, durationMs));
      }
      return;
    }

    if (!state.isTooltipActive) {
      setHover(null);
      return;
    }

    // Compute ms from raw mouse position so we're never snapped to a data point
    const svg = containerRef.current?.querySelector('svg');
    const plotArea = svg?.querySelector('.recharts-cartesian-grid') as SVGElement | null;
    const plotRect = plotArea?.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!plotRect || !containerRect) { setHover(null); return; }

    const relX = event.clientX - plotRect.left;
    if (relX < 0 || relX > plotRect.width) { setHover(null); return; }

    const ms = Math.round(domain[0] + (relX / plotRect.width) * (domain[1] - domain[0]));
    const { value, ratingCount } = valueAtMs(data, ms);
    setHover({
      ms,
      value,
      ratingCount,
      mouseX: event.clientX - containerRect.left,
      mouseY: event.clientY - containerRect.top,
      plotTop: plotRect.top - containerRect.top,
      plotHeight: plotRect.height,
    });
  }, [data, domain, durationMs]);

  const handleChartMouseLeave = useCallback(() => {
    if (!panRef.current) setHover(null);
  }, []);

  // Capture inner chart width when pan starts (from recharts activeCoordinate context)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Measure the recharts plot area width from the SVG element
    const svg = containerRef.current?.querySelector('svg');
    const plotArea = svg?.querySelector('.recharts-cartesian-grid') as SVGElement | null;
    const innerWidth = plotArea?.getBoundingClientRect().width ?? containerRef.current?.clientWidth ?? 0;
    panRef.current = { startX: e.clientX, startDomain: domain, innerWidth };
  }, [domain]);

  const handleMouseUp = useCallback(() => { panRef.current = null; }, []);
  const handleMouseLeave = useCallback(() => { panRef.current = null; setHover(null); }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek) return;
    const svg = containerRef.current?.querySelector('svg');
    const plotArea = svg?.querySelector('.recharts-cartesian-grid') as SVGElement | null;
    const plotRect = plotArea?.getBoundingClientRect();
    if (!plotRect) return;
    const relX = e.clientX - plotRect.left;
    if (relX < 0 || relX > plotRect.width) return;
    const ms = Math.round(domain[0] + (relX / plotRect.width) * (domain[1] - domain[0]));
    onSeek(ms);
  }, [onSeek, domain]);


  const zoomIn = useCallback(() => {
    const mid = (domain[0] + domain[1]) / 2;
    const newHalf = Math.max(MIN_VIEW_MS, viewMs * ZOOM_STEP) / 2;
    setDomain(clampDomain(mid - newHalf, mid + newHalf, durationMs));
  }, [domain, viewMs, durationMs]);

  const zoomOut = useCallback(() => {
    const mid = (domain[0] + domain[1]) / 2;
    const newHalf = Math.min(durationMs, viewMs / ZOOM_STEP) / 2;
    setDomain(clampDomain(mid - newHalf, mid + newHalf, durationMs));
  }, [domain, viewMs, durationMs]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-white/5 bg-surface-1">
        <p className="text-sm text-white/30">No interval ratings yet — be the first to map this song.</p>
      </div>
    );
  }

  const ratedPoints = data.filter((p) => p.value !== null);
  const peak = ratedPoints.reduce(
    (max, p) => ((p.value ?? 0) > (max.value ?? 0) ? p : max),
    ratedPoints[0]
  );

  const visibleData = filterToDomain(data, domain[0], domain[1]);
  const xTicks = getNiceTicks(domain[0], domain[1]);

  return (
    <div className="relative select-none">
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background: `radial-gradient(ellipse 30% 60% at ${((peak.ms - domain[0]) / viewMs) * 100}% 100%, ${accentColor}1f 0%, transparent 70%)`,
        }}
      />

      <div className="mb-3 flex items-center justify-between text-xs text-white/40">
        <span>Listener Sentiment</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
            Peak at {msToTimestamp(peak.ms)} — {(peak.value ?? 0).toFixed(1)}/10
          </span>
          <div className="flex items-center gap-1">
            <button onClick={zoomIn} disabled={viewMs <= MIN_VIEW_MS} className="rounded p-1 transition hover:bg-white/5 disabled:opacity-30" title="Zoom in">
              <ZoomIn size={13} />
            </button>
            <button onClick={zoomOut} disabled={isFullView} className="rounded p-1 transition hover:bg-white/5 disabled:opacity-30" title="Zoom out">
              <ZoomOut size={13} />
            </button>
            <button onClick={() => setDomain([0, durationMs])} disabled={isFullView} className="rounded p-1 transition hover:bg-white/5 disabled:opacity-30" title="Reset zoom">
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative ${panRef.current ? 'cursor-grabbing' : isFullView ? 'cursor-crosshair' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={visibleData}
            margin={{ top: 4, right: 32, bottom: 0, left: -24 }}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
            <defs>
              <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d946ef" stopOpacity={0.5} />
                <stop offset="40%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="personalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
                <stop offset="40%" stopColor="#dc2626" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#991b1b" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="50%" stopColor="#d946ef" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <linearGradient id="personalLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="ms"
              type="number"
              domain={domain}
              allowDataOverflow={true}
              ticks={xTicks}
              tick={<CustomXAxisTick />}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 10]}
              ticks={[0, 5, 10]}
              tick={{ fill: '#4b5563', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />

            {/* Suppress recharts default tooltip — we render our own */}
            <Tooltip content={() => null} cursor={false} />

            {peak.ms >= domain[0] && peak.ms <= domain[1] && (
              <ReferenceLine x={peak.ms} stroke={isPersonal ? 'rgba(239,68,68,0.5)' : 'rgba(217,70,239,0.5)'} strokeDasharray="4 4" ifOverflow="visible" />
            )}
            {peakMs && peakMs !== peak.ms && peakMs >= domain[0] && peakMs <= domain[1] && (
              <ReferenceLine x={peakMs} stroke="rgba(168,85,247,0.3)" strokeDasharray="4 4" ifOverflow="visible" />
            )}

            <Area
              type="monotone"
              dataKey="value"
              stroke={accentColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Tooltip — only shown when hovering over a rated region */}
        {hover && hover.value !== null && (() => {
          const containerWidth = containerRef.current?.clientWidth ?? 0;
          const cursorX = hover.mouseX;
          // y pixel = top of plot + (1 - normalised value) * plotHeight
          const dotY = hover.plotTop + (1 - hover.value / 10) * hover.plotHeight;
          return (
            <>
              <div className="pointer-events-none absolute top-0 w-px" style={{ left: cursorX, height: 200, backgroundColor: `${accentColor}66` }} />
              {/* Dot snapped to the line */}
              <div
                className="pointer-events-none absolute z-20 h-3 w-3 rounded-full border-2 border-white"
                style={{ left: cursorX - 6, top: dotY - 6, backgroundColor: accentColor, boxShadow: `0 0 6px 2px ${accentColor}99` }}
              />
              <div
                className="pointer-events-none absolute z-10 rounded-lg bg-surface-2/95 px-3 py-2 text-sm shadow-xl backdrop-blur"
                style={{
                  border: `1px solid ${accentColor}4d`,
                  left: cursorX + 12,
                  top: Math.max(0, hover.mouseY - 40),
                  transform: cursorX > containerWidth - 160 ? 'translateX(-110%)' : undefined,
                }}
              >
                <p className="font-mono" style={{ color: accentColor }}>{msToTimestamp(hover.ms)}</p>
                <p className="mt-0.5 text-white">
                  <span className="font-semibold" style={{ color: accentColor }}>{hover.value.toFixed(2)}</span>
                  <span className="text-white/50"> / 10</span>
                </p>
                <p className="text-xs text-white/40">{hover.ratingCount} ratings</p>
              </div>
            </>
          );
        })()}
      </div>

      {!isFullView && (
        <div className="mt-2 relative h-1 rounded-full bg-white/5">
          <div
            className="absolute h-full rounded-full"
            style={{ backgroundColor: `${accentColor}66`,
              left: `${(domain[0] / durationMs) * 100}%`,
              width: `${(viewMs / durationMs) * 100}%`,
            }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-white/30">
        <span>{msToTimestamp(0)}</span>
        {!isFullView && (
          <span className="font-mono text-white/20">
            {msToTimestamp(domain[0])} – {msToTimestamp(domain[1])}
          </span>
        )}
        <span>{msToTimestamp(durationMs)}</span>
      </div>
    </div>
  );
}
