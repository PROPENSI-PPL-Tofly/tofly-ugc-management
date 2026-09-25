export interface RevisionRequest { 
  revisionNotes: string;
}

export function checkRevisionRequest(input: unknown): RevisionRequest { 
  const body = input as RevisionRequest;
  return { revisionNotes: body.revisionNotes };
}
