// "Now" as an injected dependency rather than a call to the global clock.
//
// Every figure in the creator table is relative to today: whether a contract is running,
// whether a deadline was missed, how many days are left. Reading the clock inside the
// service would make those answers untestable without freezing global time.
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
