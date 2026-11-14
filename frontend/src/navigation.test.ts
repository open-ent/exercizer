import { describe, expect, it } from 'vitest';

import { GRAIN } from './grains';
import { referenceStatement, statementBlocks } from './navigation';

const statement = (id: number) => ({ id, grain_type_id: GRAIN.STATEMENT });
const question = (id: number) => ({ id, grain_type_id: GRAIN.QCM });

describe('statementBlocks', () => {
  it('rattache chaque question au dernier énoncé qui la précède', () => {
    const blocks = statementBlocks([question(1), statement(2), statement(3), question(4), question(5)]);
    expect(blocks.map((block) => [block.statement?.id ?? null, block.questions.map((q) => q.id)])).toEqual([
      [null, [1]],
      [2, []],
      [3, [4, 5]],
    ]);
  });

  it('ne fabrique rien pour une liste vide', () => {
    expect(statementBlocks([])).toEqual([]);
  });
});

describe('referenceStatement', () => {
  const grains = [statement(1), question(2), question(3), statement(4), question(5)];

  it("donne l'énoncé du bloc, déplié pour la première question seulement", () => {
    expect(referenceStatement(grains[1], grains)).toEqual({ statement: grains[0], first: true });
    expect(referenceStatement(grains[2], grains)).toEqual({ statement: grains[0], first: false });
    expect(referenceStatement(grains[4], grains)).toEqual({ statement: grains[3], first: true });
  });

  it("ne rappelle rien pour un énoncé ni pour une question sans énoncé", () => {
    expect(referenceStatement(grains[0], grains)).toBeNull();
    expect(referenceStatement(question(9), [question(9)])).toBeNull();
  });
});
