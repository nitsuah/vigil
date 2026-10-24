"use client";

import { TrendingUp } from 'lucide-react';
import { Metric } from '@/types/repo';
import { useState } from 'react';
import { joinMetricValue } from '../../lib/format-metric';

interface MetricsSectionProps {
  metrics: Metric[];
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export function MetricsSection({ metrics, isExpanded: isExpandedProp, onToggleExpanded }: MetricsSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const setIsExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));
  
  // Filter out metrics that are shown in other sections
  const excludeKeywords = [
    'coverage',
    'skipped tests',
    'test cases',
    'test files',
    'build time',
    'bundle size',
    'e2e tests',
    'utilities & effects',
    'shared systems',
    'shared ui components',
    'components',
    'logic',
    'total unit tests',
    'unit tests',
    'open issues',
    'critical issue',
    'high priority issue',
    'failed build',
    'community standards',
    'best practices',
    'testing & quality',
    'documentation health',
  ];

  const otherMetrics = metrics.filter((m) => {
    const lowerName = m.name.toLowerCase();
    return !excludeKeywords.some((keyword) => lowerName.includes(keyword));
  });

  if (otherMetrics.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-green-900/30 via-slate-800/50 to-green-800/20 rounded-lg overflow-hidden border border-green-500/40 shadow-lg shadow-green-500/10 hover:border-green-400/50 transition-colors" data-tour="metrics">
      <button
        onClick={setIsExpanded}
        className="w-full px-4 py-3 text-left hover:bg-green-900/20 transition-colors border-b border-green-500/20"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
              Metrics
              <span title="Self-Reported" className="text-xs font-normal text-slate-400">⚠️</span>
            </h4>
            <span
              title={`Metrics: ${otherMetrics.length} tracked`}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 ml-1"
            >
              {otherMetrics.length}
            </span>
          </div>
          <span className="text-slate-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 py-3">
          <div className="space-y-2">
            {otherMetrics.map((metric, index) => (
              <div key={`${metric.name}-${index}`} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{metric.name}</span>
                <span className="text-slate-200 font-medium">
                  {joinMetricValue(metric.value, metric.unit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
