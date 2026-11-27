"use client";

import { Sparkles, X } from 'lucide-react';
import { useState } from 'react';

interface AISummarySectionProps {
  aiSummary?: string;
  repoName?: string;
  isAuthenticated?: boolean;
  generatingSummary?: boolean;
  onGenerateSummary?: () => void;
  onDismiss?: () => void;
}

export function AISummarySection({
  aiSummary,
  repoName,
  isAuthenticated = true,
  generatingSummary = false,
  onGenerateSummary,
  onDismiss,
}: AISummarySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Expanded by default

  const hasSummary = aiSummary && aiSummary.trim() && !aiSummary.startsWith('Summary unavailable');

  return (
    <div className="bg-gradient-to-br from-purple-900/30 via-slate-800/50 to-purple-800/20 rounded-lg overflow-hidden border border-purple-500/40 shadow-lg shadow-purple-500/10 hover:border-purple-400/50 transition-colors">
      <div className="w-full px-4 py-3 border-b border-slate-700/30 hover:bg-slate-700/40 transition-colors">
        <div className="flex items-center justify-between">
          <div 
            className="flex items-center gap-2 flex-1 cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Sparkles className="h-4 w-4 text-purple-400" />
            <h4 className="text-sm font-semibold text-slate-200">AI Summary</h4>
            <span className="text-slate-500 text-xs ml-2">{isExpanded ? '▼' : '▶'}</span>
          </div>
          {isAuthenticated && onGenerateSummary && repoName && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGenerateSummary();
              }}
              disabled={generatingSummary}
              className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded transition-colors disabled:opacity-50 text-xs font-medium"
              title="Generate AI summary"
            >
              <Sparkles className={`h-3 w-3 ${generatingSummary ? 'animate-pulse' : ''}`} />
              <span className="truncate">{generatingSummary ? 'Generating...' : 'Generate'}</span>
            </button>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 py-3">
          {hasSummary ? (
            <div className="relative">
              {onDismiss && isAuthenticated && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                  }}
                  className="absolute top-0 right-0 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Hide AI summary"
                  aria-label="Hide AI summary"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <p className="text-sm text-slate-200 leading-relaxed pr-6">{aiSummary}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No AI summary generated yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
