/**
 * The Specification pattern (Evans & Fowler; Evans, Domain-Driven Design, ch. 9): a business
 * rule held as its own object, so any candidate can be asked whether it satisfies the rule and
 * the services that need the rule depend on it rather than re-deriving it.
 */
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}
