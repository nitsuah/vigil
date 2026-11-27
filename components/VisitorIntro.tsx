"use client";

import { useEffect, useState } from 'react';
import { readTourState, writeTourState, type TourState } from '@/lib/tour-state';

interface VisitorIntroProps {
  onStartTour: (resume: boolean) => void;
}

/** Explains Vigil to signed-out visitors. Dismissible, and can be reopened. */
export function VisitorIntro({ onStartTour }: VisitorIntroProps) {
  // null until storage has been read, so a dismissed panel never flashes.
  // Storage is browser-only, so it is read once after mount: that is the one
  // state update in an effect that the disable comment below allows.
  const [state, setState] = useState<TourState | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setState(readTourState()), []);
  if (!state) return null;

  const setDismissed = (introDismissed: boolean) => {
    writeTourState({ introDismissed });
    setState({ ...readTourState(), introDismissed });
  };

  if (state.introDismissed) {
    return (
      <button type="button" onClick={() => setDismissed(false)} className="min-h-11 text-sm text-indigo-300 underline hover:text-indigo-200">
        What is Vigil?
      </button>
    );
  }

  const start = (resume: boolean) => onStartTour(resume);
  const canResume = readTourState().tour === 'partial';
  const buttonClass = 'min-h-11 rounded-lg px-4 py-2 text-sm font-medium';

  return (
    <section aria-labelledby="intro-title" className="glass space-y-3 rounded-lg p-4 sm:p-5">
      <h2 id="intro-title" className="text-lg font-semibold text-slate-100">Keep watch over all your repositories</h2>
      <p className="text-sm text-slate-300">
        Vigil grades each GitHub repository and rolls up its tasks, docs and CI, for developers who maintain more repos than
        they can watch by hand. The repositories listed here are a live public demo: select one to see its report.
      </p>
      <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
        <div><dt className="inline font-semibold text-slate-200">Tier (T1 to T4): </dt><dd className="inline">how important the owner says a repo is.</dd></div>
        <div><dt className="inline font-semibold text-slate-200">Health grade: </dt><dd className="inline">a letter for overall repo health.</dd></div>
        <div><dt className="inline font-semibold text-slate-200">Sec badge: </dt><dd className="inline">security health, shown after sign-in.</dd></div>
        <div><dt className="inline font-semibold text-slate-200">Docs and CI: </dt><dd className="inline">which core files exist, and whether the build passes.</dd></div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {canResume && (
          <button type="button" onClick={() => start(true)} className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-500`}>
            Resume tour
          </button>
        )}
        <button type="button" onClick={() => start(false)} className={`${buttonClass} ${canResume ? 'border border-slate-600 text-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}>
          {canResume ? 'Start over' : 'Take the tour'}
        </button>
        <button type="button" onClick={() => setDismissed(true)} className={`${buttonClass} text-slate-400 hover:text-slate-200`}>
          Dismiss
        </button>
        <span className="text-xs text-slate-500">Sign in with GitHub to track your own repositories.</span>
      </div>
    </section>
  );
}
