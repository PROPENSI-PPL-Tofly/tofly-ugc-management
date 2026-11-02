import { DeadlineExceeded, mapWithLimit, withDeadline } from './run-limits.js';

describe('withDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives back what the work answered within the time', async () => {
    await expect(withDeadline(Promise.resolve('read'), 1000)).resolves.toBe(
      'read',
    );
  });

  it("passes the work's own failure on", async () => {
    await expect(
      withDeadline(Promise.reject(new TypeError('boom')), 1000),
    ).rejects.toThrow(TypeError);
  });

  it('stops waiting once the time is up, naming the limit and nothing else', async () => {
    const pending = withDeadline(new Promise(() => undefined), 1000);
    const settled = expect(pending).rejects.toThrow(
      new DeadlineExceeded('no answer within 1000 ms'),
    );

    await vi.advanceTimersByTimeAsync(999);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
  });

  it('is named DeadlineExceeded, so the log can tell it from other failures', () => {
    expect(new DeadlineExceeded('x').name).toBe('DeadlineExceeded');
  });

  it('clears its timer when the work answers first, so nothing fires later', async () => {
    await withDeadline(Promise.resolve(1), 1000);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('mapWithLimit', () => {
  it('keeps each answer in the place of its item', async () => {
    const answers = await mapWithLimit([3, 1, 2], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n));
      return n * 10;
    });

    expect(answers).toEqual([30, 10, 20]);
  });

  it('never runs more than the limit at once, so a big run cannot flood a platform', async () => {
    let running = 0;
    let most = 0;
    await mapWithLimit([1, 2, 3, 4, 5, 6], 4, async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
    });

    expect(most).toBe(4);
  });

  it('starts only as many as there are items', async () => {
    const work = vi.fn(async (n: number) => n);

    expect(await mapWithLimit([7], 4, work)).toEqual([7]);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('answers an empty list with an empty list', async () => {
    expect(await mapWithLimit([], 4, async () => 1)).toEqual([]);
  });
});
