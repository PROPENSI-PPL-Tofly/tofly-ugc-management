// Pure validation for the Add Creator form. Kept apart from the modal component so each
// rule is testable without rendering anything, one RED/GREEN cycle at a time.

export interface CreatorFormInput {
  name: string;
}

export interface CreatorFormErrors {
  name?: string;
}

// Not implemented yet — rules arrive one at a time, starting with the required name.
export function validateCreatorForm(_input: CreatorFormInput): CreatorFormErrors {
  return {};
}
