import { describe, expect, it } from 'vitest';
import { automaticCorrection, formatScore } from './correction';
import inputs from './__fixtures__/correction-inputs.json';
import expected from './__fixtures__/correction-cases.json';

/**
 * Parité avec la correction SERVEUR du site public (`practice/AutomaticCorrection.java`).
 *
 * `correction-cases.json` est le résultat de `correction.ts` sur `correction-inputs.json` ; le test
 * Java `AutomaticCorrectionParityTest` lit le même fichier. Si l'une des deux corrections change, l'un
 * des deux tests échoue : un même exercice ne peut pas être noté différemment dans l'ENT et sur le
 * site public. Régénérer : `UPDATE_PARITY=1 pnpm vitest run correctionParity` puis relire le diff.
 */
type Input = { name: string; type: number; max: number; reference: object; filled: object };

export function computeCases(list: Input[]) {
  return list.map((input) => {
    const result = automaticCorrection(input.type, input.max, input.reference, input.filled);
    return { ...input, score: formatScore(result.calculated_score), answers: result.answers };
  });
}

describe('parité de la correction automatique avec le serveur', () => {
  it('donne les résultats consignés dans correction-cases.json', async () => {
    const actual = computeCases(inputs as Input[]);
    if (process.env.UPDATE_PARITY) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        new URL('./__fixtures__/correction-cases.json', import.meta.url),
        JSON.stringify(actual, null, 2) + '\n',
      );
    }
    // JSON : un verdict `undefined` disparaît, comme dans le fichier.
    expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
  });
});
