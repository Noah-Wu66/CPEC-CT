'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
  className?: string;
  disabled?: boolean;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      value,
      defaultValue = [0],
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      className,
      disabled = false,
    },
    ref
  ) => {
    const currentValue = value?.[0] ?? defaultValue[0];
    const percentage = ((currentValue - min) / (max - min)) * 100;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      onValueChange?.([newValue]);
    };

    return (
      <div className={cn('relative flex w-full touch-none select-none items-center', className)}>
        <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-[rgba(221,213,200,0.9)]">
          <div
            className="absolute h-full bg-[var(--oa-blue)] transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={handleChange}
          disabled={disabled}
          className="absolute h-2 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--oa-blue)]
            [&::-webkit-slider-thumb]:bg-[var(--oa-paper)] [&::-webkit-slider-thumb]:shadow
            [&::-webkit-slider-thumb]:transition-colors
            [&::-webkit-slider-thumb]:hover:bg-accent
            [&::-webkit-slider-thumb]:focus-visible:outline-none
            [&::-webkit-slider-thumb]:focus-visible:ring-2
            [&::-webkit-slider-thumb]:focus-visible:ring-ring
            [&::-webkit-slider-thumb]:focus-visible:ring-offset-2
            [&::-webkit-slider-thumb]:disabled:pointer-events-none
            [&::-webkit-slider-thumb]:disabled:opacity-50
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--oa-blue)]
            [&::-moz-range-thumb]:bg-[var(--oa-paper)] [&::-moz-range-thumb]:shadow
            [&::-moz-range-thumb]:transition-colors
            [&::-moz-range-thumb]:hover:bg-accent
            [&::-moz-range-thumb]:disabled:pointer-events-none
            [&::-moz-range-thumb]:disabled:opacity-50"
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider };
