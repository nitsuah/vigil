// Health breakdown popup component showing detailed score breakdown

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FlaskConical, Shield, ShieldAlert, Clock } from 'lucide-react';
import { Repo, RepoDetails } from '@/types/repo';
import { calculateHealthScore } from '@/lib/health-score';
import { buildHealthScoreInputs } from '@/lib/health-score-inputs';
import { getHealthProfile, type HealthProfileId } from '@/lib/health-profiles';

interface HealthBreakdownProps {
  repo: Repo;
  details: RepoDetails;
  health: { grade: string; color: string };
  onToggle: () => void;
}

export function HealthBreakdown({ repo, details, health, onToggle }: HealthBreakdownProps): React.JSX.Element {
  const [showPopup, setShowPopup] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when Escape hands focus back to the button, so that focus doesn't reopen it.
  const suppressFocusOpen = React.useRef(false);

  const cancelClose = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Close after a short grace period so the pointer can cross the gap from
  // the grade button into the popup (and reach the profile selector); entering
  // or focusing the popup cancels it.
  const scheduleClose = (): void => {
    cancelClose();
    closeTimer.current = setTimeout(() => setShowPopup(false), 150);
  };

  React.useEffect(() => cancelClose, []);

  const handleMouseEnter = (): void => {
    cancelClose();
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popupWidth = Math.min(400, window.innerWidth - 32);
    const idealLeft = rect.left + rect.width / 2;
    const clampedLeft = Math.max(
      popupWidth / 2 + 16,
      Math.min(window.innerWidth - popupWidth / 2 - 16, idealLeft)
    );
    const popupHeight = 290;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= popupHeight
      ? rect.bottom + 8
      : Math.max(8, rect.top - popupHeight - 8);
    setPosition({ top, left: clampedLeft });
    setShowPopup(true);
  };

  // Keep the popup open while focus moves between the button and the popup.
  const handleBlur = (e: React.FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    if (next && (popupRef.current?.contains(next) || buttonRef.current?.contains(next))) return;
    scheduleClose();
  };

  const [now] = useState(() => Date.now());

  const profileId: HealthProfileId = repo.health_profile || 'production';
  const profile = getHealthProfile(profileId);

  const scores = useMemo(
    () => calculateHealthScore(buildHealthScoreInputs({ ...repo, health_profile: profileId }, details, now)),
    [repo, details, now, profileId]
  );

  const changeProfile = async (nextProfile: HealthProfileId): Promise<void> => {
    if (nextProfile === profileId || updatingProfile) return;
    try {
      setUpdatingProfile(true);
      const response = await fetch(`/api/repos/${encodeURIComponent(repo.name)}/update-health-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: nextProfile }),
      });
      if (!response.ok) {
        throw new Error('Failed to update health profile');
      }
      window.location.reload();
    } catch (error) {
      console.error('Failed to update health profile:', error);
      setUpdatingProfile(false);
    }
  };

  const securityColor =
    scores.security < 40 ? 'red' :
    scores.security < 60 ? 'orange' :
    scores.security < 80 ? 'yellow' : 'green';

  const activityColor =
    scores.activity < 40 ? 'red' :
    scores.activity < 60 ? 'orange' :
    scores.activity < 80 ? 'yellow' : 'green';

  const scoresForDisplay = [
    { label: 'Community', score: scores.community, color: 'green', weight: profile.weights.community },
    { label: 'Best Practices', score: scores.bestPractices, color: 'purple', weight: profile.weights.bestPractices },
    { label: 'Testing', score: scores.testing, color: 'blue', weight: profile.weights.testing },
    { label: 'Documentation', score: scores.documentation, color: 'slate', weight: profile.weights.documentation },
    { label: 'Activity', score: scores.activity, color: activityColor, weight: profile.weights.activity },
    { label: 'Security', score: scores.security, color: securityColor, weight: profile.weights.security },
  ];

  const colorMap: Record<string, { text: string; bg: string; hex: string }> = {
    slate: { text: 'text-slate-400', bg: 'bg-slate-500', hex: '#64748b' },
    blue: { text: 'text-blue-400', bg: 'bg-blue-500', hex: '#3b82f6' },
    purple: { text: 'text-purple-400', bg: 'bg-purple-500', hex: '#a855f7' },
    green: { text: 'text-green-400', bg: 'bg-green-500', hex: '#22c55e' },
    yellow: { text: 'text-yellow-400', bg: 'bg-yellow-500', hex: '#eab308' },
    orange: { text: 'text-orange-400', bg: 'bg-orange-500', hex: '#f97316' },
    red: { text: 'text-red-400', bg: 'bg-red-500', hex: '#ef4444' },
  };

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          if (suppressFocusOpen.current) {
            suppressFocusOpen.current = false;
            return;
          }
          handleMouseEnter();
        }}
        onBlur={handleBlur}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          } else if (e.key === 'Tab' && !e.shiftKey && showPopup) {
            // The popup is portaled to <body>, outside the natural tab order.
            e.preventDefault();
            selectRef.current?.focus();
          } else if (e.key === 'Escape') {
            cancelClose();
            setShowPopup(false);
          }
        }}
        className={`text-lg font-bold ${health.color} cursor-pointer hover:opacity-80 transition-opacity`}
        aria-label={`Health grade ${health.grade} — click to toggle shields`}
        aria-describedby={showPopup ? `health-popup-${repo.name}` : undefined}
      >
        {health.grade}
      </button>
      {showPopup && position && createPortal(
        <div
          id={`health-popup-${repo.name}`}
          role="dialog"
          aria-label="Health breakdown"
          ref={popupRef}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              cancelClose();
              setShowPopup(false);
              suppressFocusOpen.current = true;
              buttonRef.current?.focus();
            }
          }}
          className="fixed -translate-x-1/2 w-[min(400px,calc(100vw-32px))] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-4"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999,
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Health Breakdown</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">{profile.description}</p>
            </div>
            <select
              ref={selectRef}
              value={profileId}
              disabled={updatingProfile}
              onChange={(e) => void changeProfile(e.target.value as HealthProfileId)}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-[10px] text-slate-200"
              aria-label="Health maturity profile"
            >
              <option value="starter">Starter</option>
              <option value="production">Production</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div className="mb-3 flex items-center justify-between text-[10px] text-slate-500">
            <span>Profile weights</span>
            <span className="text-slate-400">Security posture {scores.securityPosture}%</span>
          </div>

          <div className="space-y-2.5">
            {scoresForDisplay.map(({ label, score, color, weight }) => {
              const colors = colorMap[color] || colorMap.blue;
              const barColor = score < 50 ? '#ef4444' : colors.hex;
              const iconMap: Record<string, React.ReactNode> = {
                Documentation: <FileText className="h-3.5 w-3.5 text-slate-400" />,
                Testing: <FlaskConical className="h-3.5 w-3.5 text-blue-400" />,
                'Best Practices': <Shield className="h-3.5 w-3.5 text-purple-400" />,
                Community: <Shield className="h-3.5 w-3.5 text-green-400" />,
                Activity: <Clock className="h-3.5 w-3.5 text-green-400" />,
                Security: <ShieldAlert className="h-3.5 w-3.5 text-red-400" />,
              };

              return (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 w-32 shrink-0">
                    {iconMap[label]}
                    <span className="text-slate-400 truncate">{label}</span>
                  </div>
                  <div className="flex-1 relative bg-slate-700 rounded-full h-1.5 overflow-visible">
                    <div
                      className="absolute top-0 bottom-0 w-px bg-yellow-400/50"
                      style={{ left: '50%' }}
                      title="50% threshold"
                    />
                    <div
                      className="h-full transition-all rounded-full"
                      style={{
                        width: `${score}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 w-16 shrink-0 justify-end">
                    <span className={`${score < 50 ? 'text-red-400' : colors.text} font-medium tabular-nums`}>{score}%</span>
                    <span className="text-slate-500 text-[10px]">({weight}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
