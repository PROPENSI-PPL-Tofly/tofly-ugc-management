import {
  checkSchedule,
  evergreenName,
  jakartaDay,
  splitName,
} from './evergreen.js';

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

describe('jakartaDay', () => {
  // Admins work in WIB (UTC+7): at 06:00 WIB on the 12th it is still the 11th in UTC.
  it('reads today in Asia/Jakarta, not UTC', () => {
    expect(jakartaDay(new Date('2026-09-11T23:00:00Z'))).toBe('2026-09-12');
  });

  it('keeps the same day when UTC and WIB agree', () => {
    expect(jakartaDay(new Date('2026-09-12T10:00:00Z'))).toBe('2026-09-12');
  });
});

describe('checkSchedule', () => {
  const TODAY = '2026-09-12';
  const valid = {
    contractStart: '2026-09-12',
    contractEnd: '2026-11-12',
    quota: 3,
    deadlines: ['2026-09-26', '2026-10-10', '2026-10-24'],
  };

  it('accepts deadlines that match the quota and sit inside the contract', () => {
    expect(checkSchedule(valid, TODAY)).toEqual({});
  });

  it('accepts deadlines on the first and the last day of the contract', () => {
    expect(
      checkSchedule(
        { ...valid, quota: 2, deadlines: ['2026-09-12', '2026-11-12'] },
        TODAY,
      ),
    ).toEqual({});
  });

  it('rejects a contract that starts before today', () => {
    expect(
      checkSchedule({ ...valid, contractStart: '2026-09-11' }, TODAY),
    ).toEqual({ contractStart: 'Tanggal mulai tidak boleh sebelum hari ini' });
  });

  it('rejects a contract that starts after it ends', () => {
    expect(
      checkSchedule({ ...valid, contractStart: '2026-11-13' }, TODAY),
    ).toEqual({
      contractStart: 'Tanggal mulai tidak boleh setelah tanggal berakhir',
    });
  });

  it('rejects contract dates that are not real calendar days', () => {
    expect(
      checkSchedule({ ...valid, contractEnd: '2026-02-30' }, TODAY),
    ).toEqual({ contractEnd: 'Format tanggal tidak valid' });
    expect(
      checkSchedule({ ...valid, contractStart: '12-09-2026' }, TODAY),
    ).toEqual({ contractStart: 'Format tanggal tidak valid' });
  });

  it('rejects a deadline that is not a real calendar day', () => {
    expect(
      checkSchedule(
        { ...valid, deadlines: ['2026-09-26', '2026-13-01', '2026-10-24'] },
        TODAY,
      ),
    ).toEqual({ deadlines: 'Format tanggal deadline tidak valid' });
  });

  it('rejects the same deadline twice', () => {
    expect(
      checkSchedule(
        { ...valid, deadlines: ['2026-09-26', '2026-09-26', '2026-10-24'] },
        TODAY,
      ),
    ).toEqual({ deadlines: 'Deadline tidak boleh ganda' });
  });

  it('rejects a deadline outside the contract period', () => {
    expect(
      checkSchedule(
        { ...valid, deadlines: ['2026-09-26', '2026-10-10', '2026-11-13'] },
        TODAY,
      ),
    ).toEqual({ deadlines: 'Deadline harus di dalam periode kontrak' });
  });

  it('rejects fewer deadlines than the content quota', () => {
    expect(
      checkSchedule({ ...valid, deadlines: ['2026-09-26'] }, TODAY),
    ).toEqual({
      deadlines: 'Jumlah deadline harus sama dengan jumlah konten (3)',
    });
  });

  it('rejects a quota below one even when no deadline is sent', () => {
    expect(checkSchedule({ ...valid, quota: 0, deadlines: [] }, TODAY)).toEqual(
      { quota: 'Jumlah konten harus lebih dari 0' },
    );
  });

  it('skips the deadline checks while the contract period itself is invalid', () => {
    expect(
      checkSchedule(
        { ...valid, contractStart: '2026-09-01', deadlines: ['bad'] },
        TODAY,
      ),
    ).toEqual({ contractStart: 'Tanggal mulai tidak boleh sebelum hari ini' });
  });
});
