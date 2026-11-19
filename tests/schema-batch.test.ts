import { describe, expect, it } from 'vitest';
import { wrapBenignDuplicates } from '../lib/db';
import { SCHEMA_MIGRATIONS } from '../lib/schema-migrations';

describe('wrapBenignDuplicates', () => {
  it('wraps a statement in a DO block that ignores duplicate errors', () => {
    const sql = wrapBenignDuplicates('ALTER TABLE repos ADD COLUMN x text');
    expect(sql).toContain('EXECUTE $vigil_stmt$ALTER TABLE repos ADD COLUMN x text$vigil_stmt$');
    expect(sql).toContain('duplicate_column OR duplicate_table OR duplicate_object');
  });

  it('no migration contains the dollar-quote tags or needs to run outside a transaction', () => {
    for (const statement of SCHEMA_MIGRATIONS) {
      expect(statement).not.toContain('$vigil_stmt$');
      expect(statement).not.toContain('$vigil_mig$');
      expect(statement.toUpperCase()).not.toContain('CONCURRENTLY');
    }
  });
});
