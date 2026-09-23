import { evergreenName, splitName } from './evergreen.js';

describe('evergreenName', () => {
  it('joins the creator name without spaces and the deadline as DDMMYYYY', () => {
    expect(evergreenName('Rangga Pratama', '2026-09-12')).toBe(
      'Evg_RanggaPratama_12092026',
    );
  });

  it('collapses leading, trailing and repeated whitespace', () => {
    expect(evergreenName('  Nabila   Putri\tSari ', '2026-10-09')).toBe(
      'Evg_NabilaPutriSari_09102026',
    );
  });

  it('keeps a single-word name as it is', () => {
    expect(evergreenName('Bagas', '2026-01-05')).toBe('Evg_Bagas_05012026');
  });

  // The day comes from the string itself, so a deadline never shifts by the server's
  // timezone the way new Date('2028-02-29') would read it in UTC-something.
  it('reads the calendar day straight from the string, leap day included', () => {
    expect(evergreenName('Intan', '2028-02-29')).toBe('Evg_Intan_29022028');
  });
});

describe('splitName', () => {
  it('keeps a single-word name as the first name only', () => {
    expect(splitName('Bagas')).toEqual({
      first_name: 'Bagas',
      middle_name: null,
      last_name: null,
    });
  });

  it('splits two words into first and last name', () => {
    expect(splitName('Rangga Pratama')).toEqual({
      first_name: 'Rangga',
      middle_name: null,
      last_name: 'Pratama',
    });
  });

  it('puts every word between the first and last into the middle name', () => {
    expect(splitName('  Muhammad  Rizky Dwi   Ananda ')).toEqual({
      first_name: 'Muhammad',
      middle_name: 'Rizky Dwi',
      last_name: 'Ananda',
    });
  });
});
