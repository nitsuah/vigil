import React from 'react';
import { computeLCS } from '@/lib/diff-lcs';

interface DiffViewProps {
  original: string;
  modified: string;
  filename: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header' | 'modified';
  content: string;
  lineNum?: { old?: number; new?: number };
  hiddenLines?: DiffLine[];
  oldContent?: string; // For modified lines, store both old and new
  newContent?: string;
}

// Helper function to find character-level differences between two strings
function getInlineChanges(oldStr: string, newStr: string): { oldParts: Array<{text: string, changed: boolean}>, newParts: Array<{text: string, changed: boolean}> } {
  const oldParts: Array<{text: string, changed: boolean}> = [];
  const newParts: Array<{text: string, changed: boolean}> = [];
  
  let i = 0, j = 0;
  const oldLen = oldStr.length;
  const newLen = newStr.length;
  
  // Find common prefix
  while (i < oldLen && j < newLen && oldStr[i] === newStr[j]) {
    i++;
    j++;
  }
  const prefix = oldStr.substring(0, i);
  
  // Find common suffix
  let oldEnd = oldLen;
  let newEnd = newLen;
  while (oldEnd > i && newEnd > j && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const suffix = oldStr.substring(oldEnd);
  
  // Extract changed parts
  const oldChanged = oldStr.substring(i, oldEnd);
  const newChanged = newStr.substring(j, newEnd);
  
  // Build old parts
  if (prefix) oldParts.push({text: prefix, changed: false});
  if (oldChanged) oldParts.push({text: oldChanged, changed: true});
  if (suffix) oldParts.push({text: suffix, changed: false});
  
  // Build new parts
  if (prefix) newParts.push({text: prefix, changed: false});
  if (newChanged) newParts.push({text: newChanged, changed: true});
  if (suffix) newParts.push({text: suffix, changed: false});
  
  return { oldParts, newParts };
}

function highlightInlineChanges(content: string, type: 'add' | 'remove', allLines: DiffLine[], currentIdx: number) {
  // Find the corresponding line of opposite type (for replacements)
  let oppositeContent = '';
  let hasOpposite = false;
  
  if (type === 'remove') {
    // Look for the next add line (must be immediately after, not separated by context)
    if (currentIdx + 1 < allLines.length && allLines[currentIdx + 1].type === 'add') {
      oppositeContent = allLines[currentIdx + 1].content || '';
      hasOpposite = true;
    }
  } else if (type === 'add') {
    // Look for the previous remove line (must be immediately before)
    if (currentIdx > 0 && allLines[currentIdx - 1].type === 'remove') {
      oppositeContent = allLines[currentIdx - 1].content || '';
      hasOpposite = true;
    }
  }
  
  // If no opposite line (pure addition or deletion), just return plain content
  if (!hasOpposite) {
    return content;
  }
  
  // For replacements, highlight the changed characters
  const { oldParts, newParts } = getInlineChanges(
    type === 'remove' ? content : oppositeContent,
    type === 'add' ? content : oppositeContent
  );
  
  const parts = type === 'remove' ? oldParts : newParts;
  
  return (
    <>
      {parts.map((part, idx) => 
        part.changed ? (
          <span 
            key={idx} 
            className={type === 'remove' ? 'bg-red-900/20 line-through opacity-70' : 'bg-green-900/20 font-medium'}
          >
            {part.text}
          </span>
        ) : (
          <span key={idx}>{part.text}</span>
        )
      )}
    </>
  );
}

/**
 * Renders a modified line showing inline deletions and additions.
 * Uses the same character-level diff algorithm to show what changed.
 */
function renderModifiedLine(oldContent: string, newContent: string): React.ReactNode {
  const { oldParts, newParts } = getInlineChanges(oldContent, newContent);
  
  // Combine old (with strikethrough) and new (with highlight) parts
  // Show new parts first, then strikethrough old parts after
  return (
    <>
      {newParts.map((part, idx) => (
        <span 
          key={`new-${idx}`} 
          className={part.changed ? 'bg-green-900/20 font-medium' : ''}
        >
          {part.text}
        </span>
      ))}
      {oldParts.map((part, idx) => 
        part.changed ? (
          <span 
            key={`old-${idx}`} 
            className="bg-red-900/20 text-red-300 line-through opacity-70"
          >
            {part.text}
          </span>
        ) : null // Don't show unchanged parts from old
      )}
    </>
  );
}

export function DiffView({ original, modified, filename }: DiffViewProps) {
  const diffLines = computeDiff(original, modified);
  const [expandedSections, setExpandedSections] = React.useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  return (
    <div className="font-mono text-xs w-full overflow-x-auto">
      {/* Diff header */}
      <div className="bg-slate-800 border-b border-slate-600 px-2 py-1 text-slate-400">
        <div>diff --git a/{filename} b/{filename}</div>
        <div>--- a/{filename}</div>
        <div>+++ b/{filename}</div>
      </div>

      {/* Diff content */}
      <div className="bg-slate-900">
        {diffLines.map((line, idx) => {
          // Handle expandable context headers
          if (line.type === 'header' && line.hiddenLines) {
            const isExpanded = expandedSections.has(idx);
            return (
              <React.Fragment key={idx}>
                <div
                  className="bg-blue-900/20 text-blue-300 px-2 py-1 cursor-pointer hover:bg-blue-900/30 border-y border-blue-800/50"
                  onClick={() => toggleExpand(idx)}
                >
                  <span className="select-none inline-block w-20 text-right mr-2 text-slate-600">...</span>
                  <span className="select-none inline-block w-4 text-slate-600">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className="text-xs">
                    {isExpanded ? 'Hide' : 'Show'} {line.hiddenLines.length} unchanged lines
                  </span>
                </div>
                {isExpanded && line.hiddenLines.map((hiddenLine, hiddenIdx) => (
                  <div
                    key={`${idx}-hidden-${hiddenIdx}`}
                    className="text-slate-400 px-2 py-0.5"
                  >
                    <span className="select-none text-slate-600 inline-block w-16 text-right mr-2">
                      {hiddenLine.lineNum?.old !== undefined && (
                        <span className="inline-block w-6 text-right">{hiddenLine.lineNum.old}</span>
                      )}
                      {' '}
                      {hiddenLine.lineNum?.new !== undefined && (
                        <span className="inline-block w-6 text-right">{hiddenLine.lineNum.new}</span>
                      )}
                    </span>
                    <span className="select-none inline-block w-4"> </span>
                    <span className="whitespace-pre-wrap break-all">{hiddenLine.content || ' '}</span>
                  </div>
                ))}
              </React.Fragment>
            );
          }

          return (
            <div
              key={idx}
              className={`px-2 py-0.5 ${
                line.type === 'add'
                  ? 'bg-green-900/30 text-green-300'
                  : line.type === 'remove'
                  ? 'bg-red-900/30 text-red-300'
                  : line.type === 'modified'
                  ? 'bg-green-900/30 text-green-300'
                  : line.type === 'header'
                  ? 'bg-blue-900/30 text-blue-300'
                  : 'text-slate-400'
              }`}
            >
              <span className="select-none text-slate-600 inline-block w-16 text-right mr-2">
                {line.lineNum?.old !== undefined && (
                  <span className="inline-block w-6 text-right">{line.lineNum.old}</span>
                )}
                {' '}
                {line.lineNum?.new !== undefined && (
                  <span className="inline-block w-6 text-right">{line.lineNum.new}</span>
                )}
              </span>
              <span className="select-none inline-block w-4">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : line.type === 'modified' ? '+' : ' '}
              </span>
              {line.type === 'modified' ? (
                <span className="whitespace-pre-wrap break-all">
                  {renderModifiedLine(line.oldContent || '', line.newContent || '')}
                </span>
              ) : line.type === 'add' || line.type === 'remove' ? (
                <span className="whitespace-pre-wrap break-all">
                  {highlightInlineChanges(line.content || '', line.type, diffLines, idx)}
                </span>
              ) : (
                <span className="whitespace-pre-wrap break-all">{line.content || ' '}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      <div className="bg-slate-800 border-t border-slate-600 px-2 py-1 text-slate-400 text-xs">
        {diffLines.filter(l => l.type === 'add').length} additions, {diffLines.filter(l => l.type === 'remove').length} deletions
      </div>
    </div>
  );
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  // Use Myers diff algorithm (LCS-based)
  // Set ignoreWhitespace to true to treat lines with only whitespace differences as unchanged
  const lcs = computeLCS(originalLines, modifiedLines, true);
  const diff: DiffLine[] = [];
  
  let oi = 0, mi = 0;
  let lcsIdx = 0;
  
  while (oi < originalLines.length || mi < modifiedLines.length) {
    if (lcsIdx < lcs.length && 
        oi === lcs[lcsIdx].oldIdx && 
        mi === lcs[lcsIdx].newIdx) {
      // This line is in common
      diff.push({
        type: 'context',
        content: originalLines[oi],
        lineNum: { old: oi + 1, new: mi + 1 },
      });
      oi++;
      mi++;
      lcsIdx++;
    } else {
      // Handle changes - collect deletions and additions, then pair them up
      const removes: DiffLine[] = [];
      const adds: DiffLine[] = [];
      
      // Collect consecutive removes
      while (oi < originalLines.length && 
             (lcsIdx >= lcs.length || oi < lcs[lcsIdx].oldIdx)) {
        removes.push({
          type: 'remove',
          content: originalLines[oi],
          lineNum: { old: oi + 1 },
        });
        oi++;
      }
      
      // Collect consecutive adds
      while (mi < modifiedLines.length && 
             (lcsIdx >= lcs.length || mi < lcs[lcsIdx].newIdx)) {
        adds.push({
          type: 'add',
          content: modifiedLines[mi],
          lineNum: { new: mi + 1 },
        });
        mi++;
      }
      
      // Pair up lines - if they're identical, treat as context
      const maxLen = Math.max(removes.length, adds.length);
      for (let i = 0; i < maxLen; i++) {
        const removeLine = i < removes.length ? removes[i] : null;
        const addLine = i < adds.length ? adds[i] : null;
        
        // If both exist and are identical, treat as context
        if (removeLine && addLine && removeLine.content === addLine.content) {
          diff.push({
            type: 'context',
            content: removeLine.content,
            lineNum: { 
              old: removeLine.lineNum?.old, 
              new: addLine.lineNum?.new 
            },
          });
        } else if (removeLine && addLine) {
          // Both exist but differ - create a modified line for inline diff
          diff.push({
            type: 'modified',
            content: addLine.content, // Use new content as primary
            oldContent: removeLine.content,
            newContent: addLine.content,
            lineNum: { 
              old: removeLine.lineNum?.old, 
              new: addLine.lineNum?.new 
            },
          });
        } else {
          // Only one exists - show as pure add or remove
          if (removeLine) diff.push(removeLine);
          if (addLine) diff.push(addLine);
        }
      }
    }
  }
  
  // Collapse context to focus on changes
  return collapseContext(diff);
}

function collapseContext(diff: DiffLine[]): DiffLine[] {
  const CONTEXT_LINES = 3;
  const result: DiffLine[] = [];
  let lastAddedIdx = -1;
  
  // Find all change blocks (consecutive non-context lines)
  const changeBlocks: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < diff.length) {
    if (diff[i].type !== 'context') {
      const blockStart = i;
      while (i < diff.length && diff[i].type !== 'context') {
        i++;
      }
      changeBlocks.push({ start: blockStart, end: i - 1 });
    } else {
      i++;
    }
  }
  
  // Process each change block with context
  changeBlocks.forEach((block, blockIdx) => {
    const contextStart = Math.max(0, block.start - CONTEXT_LINES);
    const contextEnd = Math.min(diff.length - 1, block.end + CONTEXT_LINES);
    
    // Add expandable header if we skipped lines
    if (lastAddedIdx >= 0 && contextStart > lastAddedIdx + 1) {
      const hiddenStart = lastAddedIdx + 1;
      const hiddenEnd = contextStart - 1;
      const hiddenLines = diff.slice(hiddenStart, hiddenEnd + 1).filter(l => l.type === 'context');
      
      if (hiddenLines.length > 0) {
        result.push({ 
          type: 'header', 
          content: '...',
          hiddenLines
        });
      }
    }
    
    // Add leading context (if this is the first block, add from start)
    if (blockIdx === 0 && contextStart > 0) {
      const hiddenLines = diff.slice(0, contextStart).filter(l => l.type === 'context');
      if (hiddenLines.length > 0) {
        result.push({ 
          type: 'header', 
          content: '...',
          hiddenLines
        });
      }
    }
    
    // Add context before change
    for (let j = contextStart; j < block.start; j++) {
      if (diff[j].type === 'context' && j > lastAddedIdx) {
        result.push(diff[j]);
        lastAddedIdx = j;
      }
    }
    
    // Add the changes
    for (let j = block.start; j <= block.end; j++) {
      result.push(diff[j]);
      lastAddedIdx = j;
    }
    
    // Add context after change
    for (let j = block.end + 1; j <= contextEnd; j++) {
      if (diff[j].type === 'context' && j > lastAddedIdx) {
        result.push(diff[j]);
        lastAddedIdx = j;
      }
    }
  });
  
  // Add final expandable section if there are trailing lines
  if (lastAddedIdx < diff.length - 1) {
    const hiddenLines = diff.slice(lastAddedIdx + 1).filter(l => l.type === 'context');
    if (hiddenLines.length > 0) {
      result.push({ 
        type: 'header', 
        content: '...',
        hiddenLines
      });
    }
  }
  
  return result;
}
