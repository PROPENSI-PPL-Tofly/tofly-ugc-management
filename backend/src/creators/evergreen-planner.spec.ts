import { planEvergreen } from './evergreen-planner.js';

/** A calendar day as Postgres `date` columns hold it: midnight UTC. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

// PRD 3.4: one Evergreen item per allocated slot, titled Evg_[sequence]_[CreatorName]_DDMMYYYY,
// numbered from 1 in deadline order.
describe('planEvergreen', () => {
  it('titles one item per deadline, numbered from 1', () => {
    expect(
      planEvergreen('Salsa Amelia', [day('2026-10-06'), day('2026-10-13')]),
    ).toEqual([
      { name: 'Evg_1_Salsa Amelia_06102026', deadline: day('2026-10-06') },
      { name: 'Evg_2_Salsa Amelia_13102026', deadline: day('2026-10-13') },
    ]);
  });

  it('numbers the items in deadline order whatever order they arrive in', () => {
    expect(
      planEvergreen('Salsa', [day('2026-11-01'), day('2026-10-06')]).map(
        (item) => item.name,
      ),
    ).toEqual(['Evg_1_Salsa_06102026', 'Evg_2_Salsa_01112026']);
  });

  it('gives same-day slots their own sequence numbers', () => {
    expect(
      planEvergreen('Salsa', [day('2026-10-06'), day('2026-10-06')]).map(
        (item) => item.name,
      ),
    ).toEqual(['Evg_1_Salsa_06102026', 'Evg_2_Salsa_06102026']);
  });

  it('pads single-digit days and months to two digits', () => {
    expect(planEvergreen('Salsa', [day('2027-01-05')])[0].name).toBe(
      'Evg_1_Salsa_05012027',
    );
  });

  it('plans nothing when there are no deadlines', () => {
    expect(planEvergreen('Salsa', [])).toEqual([]);
  });

  it('does not reorder the caller’s list', () => {
    const deadlines = [day('2026-11-01'), day('2026-10-06')];

    planEvergreen('Salsa', deadlines);

    expect(deadlines).toEqual([day('2026-11-01'), day('2026-10-06')]);
  });
});
