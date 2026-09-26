'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (values.length < 2) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4">
        <p className="text-center text-[11px] text-stone-500">{emptyLabel}</p>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = 8;
  const usableWidth = Math.max(0, size.width - pad * 2);
  const usableHeight = Math.max(0, size.height - pad * 2);
  const points = values.map((value, index) => ({
    x: pad + (index / (values.length - 1)) * usableWidth,
    y: pad + (1 - (range === 0 ? 0.5 : (value - min) / range)) * usableHeight,
    value,
    date: dates[index],
  }));

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.width > 0 && size.height > 0 ? (
        <svg width={size.width} height={size.height} className="block overflow-visible" role="img">
          <motion.polyline
            initial={false}
            animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
            transition={{ duration: 0.9, ease: 'easeInOut', delay: active ? 0.15 : 0 }}
            fill="none"
            points={points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          {points.map((point, index) => (
            <motion.circle
              key={`${point.date ?? index}-${index}`}
              cx={point.x}
              cy={point.y}
              r="3"
              fill="white"
              stroke={stroke}
              strokeWidth="1.5"
              initial={false}
              animate={{ scale: active ? 1 : 0 }}
              transition={{ delay: active ? 0.5 + index * 0.05 : 0 }}
            >
              <title>{`${point.date ?? ''} · ${formatValue(point.value)}`}</title>
            </motion.circle>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
