'use client';

import { useRef, useEffect, useLayoutEffect } from 'react';
import { X } from 'lucide-react';
import type { TourStep } from './tour-steps';

interface TourTooltipProps {
  step: TourStep;
  currentStep: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  isAutoAdvancing: boolean;
  countdown: number;
  position: { top: number; left: number };
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onPauseAutoAdvance: () => void;
  onMeasure?: (height: number) => void;
}

export function TourTooltip({
  step,
  currentStep,
  totalSteps,
  isFirstStep,
  isLastStep,
  isAutoAdvancing,
  countdown,
  position,
  onNext,
  onPrevious,
  onSkip,
  onPauseAutoAdvance,
  onMeasure,
}: TourTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const titleId = `tour-step-title-${currentStep}`;

  const prevHeightRef = useRef<number>(0);
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const report = () => {
      const h = el.offsetHeight;
      if (h !== prevHeightRef.current) {
        prevHeightRef.current = h;
        onMeasure?.(h);
      }
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentStep, onMeasure]);

  useEffect(() => {
    tooltipRef.current?.focus();
  }, [currentStep]);

  return (
    <div
      ref={tooltipRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="absolute bg-slate-900 border-2 border-blue-400 rounded-lg shadow-[0_0_40px_rgba(59,130,246,0.4)] p-6 w-[min(400px,calc(100vw-32px))] z-[10000] focus:outline-none"
      style={{ top: position.top, left: position.left }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onSkip(); } }}
    >
      <button
        onClick={onSkip}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-200 transition-colors"
        aria-label="Close tour"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
          <span className="font-semibold">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <button
            onClick={onSkip}
            className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            Skip tour
          </button>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
        {isAutoAdvancing && (
          <p className="text-xs text-slate-400 mt-2 italic">
            Auto-advancing in {countdown} second{countdown !== 1 ? 's' : ''}...
          </p>
        )}
      </div>

      <h3 id={titleId} className="text-xl font-semibold text-slate-100 mb-3">{step.title}</h3>
      <p className="text-slate-300 mb-6 leading-relaxed">{step.description}</p>

      <div className="flex items-center justify-between">
        <button
          onClick={onPrevious}
          disabled={isFirstStep}
          className={`px-4 py-2 rounded-lg transition-colors ${
            isFirstStep
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
          }`}
        >
          Previous
        </button>
        <div className="flex gap-2">
          {!isLastStep && isAutoAdvancing && (
            <button
              onClick={onPauseAutoAdvance}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors text-sm"
            >
              Pause
            </button>
          )}
          <button
            onClick={onNext}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
