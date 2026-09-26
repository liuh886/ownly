'use client';

import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { buildDualLinePoints } from './homeDashboardUtils';

export function MetricFlipCard({
  ariaLabel,
  front,
  back,
}: {
  ariaLabel: string;
  front: ReactNode;
  back: (active: boolean) => ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <button
      type="button"
      aria-pressed={flipped}
      aria-label={ariaLabel}
      onClick={() => setFlipped((value) => !value)}
      className="h-full min-h-[7.5rem] w-full cursor-pointer touch-manipulation text-left [perspective:1000px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line"
    >
      <motion.div
        className="relative h-full min-h-[7.5rem] w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">{front}</div>
        <div className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]">
          {back(flipped)}
        </div>
      </motion.div>
    </button>
  );
}

export function MetricTrendChart({
  active,
  values,
  dates,
  stroke,
  formatValue,
  emptyLabel,
}: {
  active: boolean;
  values: number[];
  dates: string[];
  stroke: string;
  formatValue: (value: number) => string;
  emptyLabel: string;
}) {
  if (values.length < 2) {
    return <p className="text-[11px] text-stone-500">{emptyLabel}</p>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = min === max
    ? values
        .map((_, index) => `${(10 + (index / (values.length - 1)) * 100).toFixed(2)},24`)
        .join(' ')
    : buildDualLinePoints(values, max, 10, min);
  const coordinates = points.split(' ');

  return (
    <svg viewBox="-2 0 124 52" className="h-full min-h-12 w-full overflow-visible" role="img">
      <text x="7" y="8" textAnchor="end" fontSize="5" fill="#a8a29e" fontFamily="ui-monospace, monospace">
        {formatValue(max)}
      </text>
      <text x="7" y="47" textAnchor="end" fontSize="5" fill="#a8a29e" fontFamily="ui-monospace, monospace">
        {formatValue(min)}
      </text>
      <line x1="10" y1="24" x2="110" y2="24" stroke="#e7e5e4" strokeWidth="0.3" />
      <motion.polyline
        initial={false}
        animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
        transition={{ duration: 0.9, ease: 'easeInOut', delay: active ? 0.15 : 0 }}
        fill="none"
        points={points}
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      {values.map((value, index) => {
        const [cx, cy] = coordinates[index].split(',').map(Number);
        return (
          <motion.circle
            key={`${dates[index] ?? index}-${index}`}
            cx={cx}
            cy={cy}
            r="2.5"
            fill="white"
            stroke={stroke}
            strokeWidth="1.5"
            className="cursor-pointer"
            initial={false}
            animate={{ scale: active ? 1 : 0 }}
            transition={{ delay: active ? 0.5 + index * 0.05 : 0 }}
          >
            <title>{`${dates[index] ?? ''} · ${formatValue(value)}`}</title>
          </motion.circle>
        );
      })}
    </svg>
  );
}
