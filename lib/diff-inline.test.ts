import { describe, it, expect } from 'vitest';
import { getInlineChanges } from './diff-inline';

describe('getInlineChanges', () => {
  it('returns one unchanged part per side for identical strings', () => {
    expect(getInlineChanges('abc', 'abc')).toEqual({
      oldParts: [{ text: 'abc', changed: false }],
      newParts: [{ text: 'abc', changed: false }],
    });
  });

  it('returns no parts for two empty strings', () => {
    expect(getInlineChanges('', '')).toEqual({ oldParts: [], newParts: [] });
  });

  it('marks a pure insertion in the middle', () => {
    expect(getInlineChanges('abcd', 'abXcd')).toEqual({
      oldParts: [{ text: 'ab', changed: false }, { text: 'cd', changed: false }],
      newParts: [{ text: 'ab', changed: false }, { text: 'X', changed: true }, { text: 'cd', changed: false }],
    });
  });

  it('marks a pure deletion in the middle', () => {
    expect(getInlineChanges('abXcd', 'abcd')).toEqual({
      oldParts: [{ text: 'ab', changed: false }, { text: 'X', changed: true }, { text: 'cd', changed: false }],
      newParts: [{ text: 'ab', changed: false }, { text: 'cd', changed: false }],
    });
  });

  it('marks a full replacement when nothing is shared', () => {
    expect(getInlineChanges('abc', 'xyz')).toEqual({
      oldParts: [{ text: 'abc', changed: true }],
      newParts: [{ text: 'xyz', changed: true }],
    });
  });

  it('handles a shared prefix only', () => {
    expect(getInlineChanges('abc1', 'abc2')).toEqual({
      oldParts: [{ text: 'abc', changed: false }, { text: '1', changed: true }],
      newParts: [{ text: 'abc', changed: false }, { text: '2', changed: true }],
    });
  });

  it('handles a shared suffix only', () => {
    expect(getInlineChanges('1abc', '2abc')).toEqual({
      oldParts: [{ text: '1', changed: true }, { text: 'abc', changed: false }],
      newParts: [{ text: '2', changed: true }, { text: 'abc', changed: false }],
    });
  });

  it('handles an empty old string', () => {
    expect(getInlineChanges('', 'abc')).toEqual({
      oldParts: [],
      newParts: [{ text: 'abc', changed: true }],
    });
  });

  it('handles an empty new string', () => {
    expect(getInlineChanges('abc', '')).toEqual({
      oldParts: [{ text: 'abc', changed: true }],
      newParts: [],
    });
  });

  it('does not double count overlapping prefix and suffix', () => {
    expect(getInlineChanges('aaa', 'aa')).toEqual({
      oldParts: [{ text: 'aa', changed: false }, { text: 'a', changed: true }],
      newParts: [{ text: 'aa', changed: false }],
    });
  });
});
