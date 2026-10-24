"use client";

import { Shield } from 'lucide-react';
import { BestPractice, Metric } from '@/types/repo';
import { useState } from 'react';

import { MAX_UNIT_LENGTH } from '../../lib/constants';
import { joinMetricValue } from '../../lib/format-metric';

interface TestingSectionProps {
  testingStatus?: string;
  coverageScore?: number;
  testCaseCount?: number;
  bestPractices: BestPractice[];
  metrics?: Metric[];
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export function TestingSection({
  testingStatus,
  coverageScore,
  testCaseCount,
  bestPractices,
  metrics = [],
  isExpanded: isExpandedProp,
  onToggleExpanded,
}: TestingSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const setIsExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));
  
  const testingPractice = bestPractices.find((p) => p.practice_type === 'testing_framework');
  const testFileCount =
    testingPractice?.details &&
    typeof testingPractice.details.test_file_count === 'number'
      ? testingPractice.details.test_file_count
      : undefined;

  // Filter testing-related metrics
  const testingKeywords = [
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
  ];

  const testingMetrics = metrics.filter((m) => {
    const lowerName = m.name.toLowerCase();
    return testingKeywords.some((keyword) => lowerName.includes(keyword));
  });

  // Hide section if no testing data at all
  const hasTestingData =
    testingStatus ||
    (coverageScore ?? 0) > 0 ||
    (testCaseCount ?? 0) > 0 ||
    (testFileCount ?? 0) > 0 ||
    testingMetrics.length > 0;
  
  if (!hasTestingData) {
    return null;
  }

  // Helper to format metric display value
  const formatMetricValue = (metric: Metric) => {
    // If unit is already included or is a long description, just show the value
    if (!metric.unit || metric.unit.length > MAX_UNIT_LENGTH) {
      return `${metric.value}`;
    }

    return joinMetricValue(metric.value, metric.unit);
  };

  // Helper to get detail text (unit column when it's descriptive)
  const getMetricDetail = (metric: Metric) => {
    // If unit is long (like a note/description), return it as detail text
    if (metric.unit && metric.unit.length > MAX_UNIT_LENGTH) {
      return metric.unit;
    }
    return null;
  };

  return (
    <div className="bg-gradient-to-br from-sky-900/30 via-slate-800/50 to-sky-800/20 rounded-lg overflow-hidden border border-sky-500/40 shadow-lg shadow-sky-500/10 hover:border-sky-400/50 transition-colors" data-tour="testing">
      <div
        onClick={setIsExpanded}
        className="w-full px-4 py-3 hover:bg-sky-900/20 transition-colors border-b border-blue-500/20 cursor-pointer"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-400" />
            <h4 className="text-sm font-semibold text-slate-200">Testing</h4>
            {coverageScore != null && (
              <span
                title={`Testing: ${coverageScore}% coverage`}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ml-1 ${
                  coverageScore >= 80
                    ? 'bg-blue-500/20 text-blue-400'
                    : coverageScore >= 50
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {coverageScore}%
              </span>
            )}
          </div>
          <span className="text-slate-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 py-3">
          <div className="space-y-3">
        {testingStatus && (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Status</span>
              <span className="text-slate-200 font-medium capitalize">{testingStatus}</span>
            </div>

            {/* Test File Count */}
            {(testFileCount ?? 0) > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-blue-300">Test Files</span>
                  <span className="text-2xl font-bold text-blue-400">{testFileCount}</span>
                </div>
              </div>
            )}

            {/* Test Case Count */}
            {(testCaseCount ?? 0) > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-blue-300">Test Cases</span>
                  <span className="text-2xl font-bold text-blue-400">{testCaseCount}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Additional Testing Metrics from METRICS.md */}
        {testingMetrics.map((metric, index) => {
          const detail = getMetricDetail(metric);
          return (
            <div key={`${metric.name}-${index}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{metric.name}</span>
                <span className="text-slate-200 font-medium">
                  {formatMetricValue(metric)}
                </span>
              </div>
              {detail && (
                <div className="text-[10px] text-slate-500 italic pl-2">
                  {detail}
                </div>
              )}
            </div>
          );
        })}
          </div>
        </div>
      )}
    </div>
  );
}
