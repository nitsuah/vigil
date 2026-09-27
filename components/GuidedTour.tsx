'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tourSteps } from './guided-tour/tour-steps';
import { TourOverlay } from './guided-tour/TourOverlay';
import { TourTooltip } from './guided-tour/TourTooltip';

interface GuidedTourProps {
  onClose: () => void;
}

export default function GuidedTour({ onClose }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const clickWaitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingTimersRef = useRef<NodeJS.Timeout[]>([]);
  const tooltipHeightRef = useRef(220);

  const step = tourSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;

  const startAutoAdvance = useCallback(() => {
    if (!isFirstStep && !isLastStep) {
      setIsAutoAdvancing(true);
      setCountdown(3);

      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);

      autoAdvanceTimerRef.current = setTimeout(() => {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        setCurrentStep((prev) => prev + 1);
        setIsAutoAdvancing(false);
      }, 3000);
    }
  }, [isFirstStep, isLastStep]);

  const clearTimers = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (clickWaitTimerRef.current) {
      clearTimeout(clickWaitTimerRef.current);
      clickWaitTimerRef.current = null;
    }
    pendingTimersRef.current.forEach(clearTimeout);
    pendingTimersRef.current = [];
  }, []);

  const scheduleDelayed = useCallback((fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      pendingTimersRef.current = pendingTimersRef.current.filter(t => t !== id);
      fn();
    }, ms);
    pendingTimersRef.current.push(id);
  }, []);

  const updateHighlight = useCallback(() => {
    const element = document.querySelector(step.target);
    if (!element) {
      if (step.id === 'welcome') {
        const w = Math.min(400, window.innerWidth - 32);
        setTooltipPosition({
          top: Math.max(100, window.innerHeight / 3 - 100),
          left: Math.max(16, window.innerWidth / 2 - w / 2),
        });
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    setHighlightRect(rect);

    const tooltipWidth = Math.min(400, window.innerWidth - 32);
    const tooltipHeight = tooltipHeightRef.current;
    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'top':
        top = rect.top - tooltipHeight;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'bottom':
        top = rect.bottom + 20;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - 100;
        left = rect.left - tooltipWidth - 20;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - 100;
        left = rect.right + 20;
        break;
    }

    top = Math.max(10, Math.min(top, window.innerHeight - tooltipHeight - 10));
    left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));
    setTooltipPosition({ top, left });
  }, [step.target, step.id, step.position]);

  // Keep a stable ref so handleTooltipMeasure can call the latest updateHighlight
  // without being in its dependency array (which would break memoization).
  const updateHighlightRef = useRef(updateHighlight);
  useEffect(() => { updateHighlightRef.current = updateHighlight; }, [updateHighlight]);

  const handleTooltipMeasure = useCallback((height: number) => {
    tooltipHeightRef.current = height;
    updateHighlightRef.current();
  }, []);

  const clickAndWait = (selector: string, delay: number, then: () => void): boolean => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.click();
      if (clickWaitTimerRef.current) clearTimeout(clickWaitTimerRef.current);
      clickWaitTimerRef.current = setTimeout(then, delay);
      return true;
    }
    return false;
  };

  useEffect(() => {
    clearTimers();

    // Register resize handler for all paths; cleanup returned unconditionally.
    window.addEventListener('resize', updateHighlight);
    const cleanup = () => {
      window.removeEventListener('resize', updateHighlight);
      clearTimers();
    };

    const firstRow = document.querySelector('tbody tr:first-child') as HTMLElement;

    if (['repo-name', 'health-score', 'docs-column', 'actions'].includes(step.id)) {
      // On mobile the Docs column is CSS-hidden; skip the step so the tour
      // doesn't highlight an invisible element.
      if (step.id === 'docs-column') {
        const docsEl = document.querySelector('[data-tour="docs"]');
        if (docsEl && docsEl.getBoundingClientRect().width === 0) {
          scheduleDelayed(() => setCurrentStep(prev => prev + 1), 50);
          return cleanup;
        }
      }
      if (firstRow && !document.querySelector('.grid')) {
        firstRow.click();
        scheduleDelayed(() => {
          updateHighlight();
          startAutoAdvance();
        }, 400);
        return cleanup;
      }
    }

    if (step.id === 'features') {
      const featuresSection = document.querySelector('[data-tour="features-section"]');
      if (featuresSection && !featuresSection.querySelector('.grid.grid-cols-3')) {
        const clicked = clickAndWait(
          '[data-tour="features-section"] div[class*="cursor-pointer"]',
          400,
          () => {
            updateHighlight();
            startAutoAdvance();
          }
        );
        if (clicked) return cleanup;
      }
      updateHighlight(); // eslint-disable-line react-hooks/set-state-in-effect
      startAutoAdvance();
      return cleanup;
    }

    if (step.id === 'roadmap' || step.id === 'tasks') {
      updateHighlight();
      startAutoAdvance();
      return cleanup;
    }

    if (step.id === 'documentation') {
      const featuresSection = document.querySelector('[data-tour="features-section"]');
      const isFeaturesExpanded = featuresSection?.querySelector('.grid.grid-cols-3');

      const expandDoc = () => {
        const docSection = document.querySelector('[data-tour="documentation"]');
        if (docSection && !docSection.querySelector('.space-y-3')) {
          clickAndWait(
            '[data-tour="documentation"] div[class*="cursor-pointer"]',
            400,
            () => scheduleDelayed(() => { updateHighlight(); startAutoAdvance(); }, 100)
          );
        } else {
          scheduleDelayed(() => { updateHighlight(); startAutoAdvance(); }, 100);
        }
      };

      if (isFeaturesExpanded && featuresSection) {
        clickAndWait(
          '[data-tour="features-section"] div[class*="cursor-pointer"]',
          400,
          expandDoc
        );
        return cleanup;
      }
      expandDoc();
      return cleanup;
    }

    if (step.id === 'best-practices' || step.id === 'testing') {
      scheduleDelayed(() => { updateHighlight(); startAutoAdvance(); }, 100);
      return cleanup;
    }

    if (step.id === 'community') {
      const docSection = document.querySelector('[data-tour="documentation"]');
      const isDocExpanded = docSection?.querySelector('.space-y-3');

      const expandCommunity = () => {
        const communitySection = document.querySelector('[data-tour="community"]');
        if (communitySection && !communitySection.querySelector('.space-y-2')) {
          clickAndWait(
            '[data-tour="community"] div[class*="cursor-pointer"]',
            400,
            () => scheduleDelayed(() => { updateHighlight(); startAutoAdvance(); }, 100)
          );
        } else {
          scheduleDelayed(() => { updateHighlight(); startAutoAdvance(); }, 100);
        }
      };

      if (isDocExpanded && docSection) {
        clickAndWait(
          '[data-tour="documentation"] div[class*="cursor-pointer"]',
          400,
          expandCommunity
        );
        return cleanup;
      }
      expandCommunity();
      return cleanup;
    }

    if (step.id === 'metrics' || step.id === 'issues') {
      const sectionEl = document.querySelector(`[data-tour="${step.id}"]`);
      if (!sectionEl) {
        scheduleDelayed(() => setCurrentStep((prev) => prev + 1), 100);
        return cleanup;
      }
      scheduleDelayed(() => { updateHighlight(); startAutoAdvance(); }, 100);
      return cleanup;
    }

    if (['add-repo', 'filters', 'sync-all'].includes(step.id)) {
      if (step.id === 'add-repo') {
        const communitySection = document.querySelector('[data-tour="community"]');
        if (communitySection?.querySelector('.space-y-2')) {
          clickAndWait(
            '[data-tour="community"] div[class*="cursor-pointer"]',
            400,
            () => { updateHighlight(); startAutoAdvance(); }
          );
          return cleanup;
        }
      }
      updateHighlight();
      startAutoAdvance();
      return cleanup;
    }

    if (['auth-status', 'gemini-status', 'version-info'].includes(step.id)) {
      const authEl = document.querySelector('[data-tour="auth-status"]');
      if (authEl && authEl.getBoundingClientRect().width === 0) {
        clickAndWait('[data-tour="profile-toggle"]', 500, () => {
          updateHighlight();
          startAutoAdvance();
        });
        return cleanup;
      }
    }

    if (step.id === 'profile-close') {
      updateHighlight();
      return cleanup;
    }

    updateHighlight();
    startAutoAdvance();

    return cleanup;
  }, [currentStep, step.id, updateHighlight, startAutoAdvance, clearTimers, scheduleDelayed]);

  const handleNext = (): void => {
    clearTimers();
    setIsAutoAdvancing(false);
    if (isLastStep) {
      const profilePicture = document.querySelector('[data-tour="profile-toggle"]');
      const statusPillsVisible = document
        .querySelector('[data-tour="auth-status"]')
        ?.getBoundingClientRect().width;
      if (profilePicture && statusPillsVisible) (profilePicture as HTMLElement).click();
      onClose();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = (): void => {
    clearTimers();
    setIsAutoAdvancing(false);
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handlePauseAutoAdvance = (): void => {
    clearTimers();
    setIsAutoAdvancing(false);
  };

  return (
    <div className="fixed inset-0 z-[9999]" data-guided-tour>
      <TourOverlay
        highlightRect={highlightRect}
        stepId={step.id}
        onSkip={onClose}
      />
      <TourTooltip
        step={step}
        currentStep={currentStep}
        totalSteps={tourSteps.length}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        isAutoAdvancing={isAutoAdvancing}
        countdown={countdown}
        position={tooltipPosition}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onSkip={onClose}
        onPauseAutoAdvance={handlePauseAutoAdvance}
        onMeasure={handleTooltipMeasure}
      />
    </div>
  );
}
