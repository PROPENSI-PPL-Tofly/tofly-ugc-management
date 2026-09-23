// Pure validation for the Add Creator form. Kept apart from the modal component so each
// rule is testable without rendering anything, one RED/GREEN cycle at a time.

export interface CreatorFormInput {
  name: string;
}

export interface CreatorFormErrors {
  name?: string;
}

export function validateCreatorForm(input: CreatorFormInput): CreatorFormErrors {
  const errors: CreatorFormErrors = {};

  if (input.name === "") {
    errors.name = "Nama wajib diisi";
  }

  return errors;
}
