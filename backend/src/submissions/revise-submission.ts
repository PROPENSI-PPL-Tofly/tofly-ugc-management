export interface RevisionRequest {
  revisionNotes: string;
}

export function checkRevisionRequest(_input: unknown): RevisionRequest {
  throw new Error('Revision request validation is not implemented yet');
}
