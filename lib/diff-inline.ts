// Helper function to find character-level differences between two strings
export type InlinePart = { text: string; changed: boolean };

export function getInlineChanges(oldStr: string, newStr: string): { oldParts: InlinePart[]; newParts: InlinePart[] } {
  const oldParts: InlinePart[] = [];
  const newParts: InlinePart[] = [];
  
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
