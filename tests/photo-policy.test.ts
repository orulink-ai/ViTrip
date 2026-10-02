import { expect, it } from 'vitest';
import { photoSchema, photosForActivity } from '../src/shared/photos';
import { ResearchBudget } from '../src/main/research-budget';
it('photo metadata never accepts a model supplied verified flag or unsafe URL', () => {
  expect(
    photoSchema.safeParse({ id: 'x', status: 'verified', imageUrl: 'file:///private' }).success,
  ).toBe(false);
});
it('photos are only linked through saved IDs, not fuzzy hotel names', () => {
  const photo = { id: 'a', subject: 'Clover hotel branch A' } as never;
  expect(photosForActivity({ photoIds: ['b'] }, [photo])).toEqual([]);
  expect(photosForActivity({ photoIds: ['a'] }, [photo])).toEqual([photo]);
});
it('repeated host failures stop without preventing other tools or saving', () => {
  const budget = new ResearchBudget();
  budget.failed('https://a.example/one');
  budget.failed('https://a.example/two');
  expect(() => budget.check('navigate', 'https://a.example/three')).toThrow();
  expect(() => budget.check('navigate', 'https://b.example/')).not.toThrow();
  expect(() => budget.check('bash')).not.toThrow();
  expect(() => budget.check('journal')).not.toThrow();
  expect(() => budget.check('save_photo')).not.toThrow();
});
