import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VALID_TRANSITIONS } from './claim-status-transitions';

/**
 * The claim lifecycle is defined twice: ClaimStatus.canTransitionTo() in the Claims
 * Service and VALID_TRANSITIONS here (which decides what the admin dropdown offers).
 * If they drift, admins are either offered transitions the server rejects or are
 * blocked from legitimate ones. This reads the Java source directly so drift fails
 * the build without needing the backend running.
 */

const CLAIM_STATUS_JAVA = path.resolve(
  __dirname,
  '../../../../../claims-service/src/main/java/com/example/demo/domain/claim/ClaimStatus.java'
);

type TransitionTable = Record<string, string[]>;

function parseJavaTransitions(source: string): TransitionTable {
  const table: TransitionTable = {};
  // Matches e.g. `case SUBMITTED -> target == UNDER_REVIEW || target == REJECTED;` and `case CLOSED -> false;`
  const caseLine = /case\s+(\w+)\s*->\s*([^;]+);/g;
  for (const [, from, body] of source.matchAll(caseLine)) {
    table[from] = [...body.matchAll(/target\s*==\s*(\w+)/g)].map(([, to]) => to);
  }
  return table;
}

const sortedTable = (table: TransitionTable) =>
  Object.fromEntries(Object.entries(table).map(([from, to]) => [from, [...to].sort()]));

describe('claim status transitions: UI and Claims Service agree', () => {
  const backend = parseJavaTransitions(readFileSync(CLAIM_STATUS_JAVA, 'utf8'));

  it('can read every status from ClaimStatus.java', () => {
    expect(Object.keys(backend).sort()).toEqual(['APPROVED', 'CLOSED', 'REJECTED', 'SUBMITTED', 'UNDER_REVIEW']);
  });

  it('offers admins exactly the transitions the backend enforces', () => {
    expect(sortedTable(VALID_TRANSITIONS)).toEqual(sortedTable(backend));
  });
});