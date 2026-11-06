import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { content_status } from '@prisma/client';
import {
  earliestDeadline,
  evergreenName,
  isCalendarDay,
  latestDeadline,
  readableDay,
} from '../creators/evergreen.js';
import {
  invoiceState,
  type InvoiceLifecycleStatus,
} from '../invoices/invoice-lifecycle.js';
import { MAX_BRIEF_LENGTH, MAX_CONTENT_NAME_LENGTH } from './new-content.js';

// Editing and deleting scheduled content (PBI-25, 25.1). Pure rules over plain values: what an
// edit body may say, when a content may still change, and what an edit writes. The service only
// wires them to one transaction, so every rule is tested without a database.

/** The fields an edit may change (AC 2), each present only when the body sent it. */
export interface ContentEdit {
  deadline?: string;
  brief?: string;
  name?: string;
}

/** What the rules read of a content, as content-edit.service selects it. */
export interface EditableContent {
  id: string;
  type: 'evergreen' | 'specific';
  name: string;
  brief: string;
  deadline: Date;
  status: content_status;
  _count: { submissions: number };
  contracts: {
    start_date: Date;
    end_date: Date;
    invoice: { status: InvoiceLifecycleStatus } | null;
    creators: {
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    };
  };
}

/** Today in Jakarta and the global scheduling buffer, the earliest-deadline rule's inputs. */
export interface SchedulingRules {
  today: string;
  bufferDays: number;
}

type EditedField = keyof ContentEdit;

/** What an edit writes, and the old and new value of each field it changes (AC 4). */
export interface ContentEditPlan {
  data: { deadline?: Date; brief?: string; name?: string };
  changes: Partial<Record<EditedField, { from: string; to: string }>>;
}

const INVALID = 'Data konten tidak valid';

function invalid(errors: Record<string, string>): UnprocessableEntityException {
  return new UnprocessableEntityException({ message: INVALID, errors });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A text field: its trimmed value, or the message it gets. */
function readText(
  value: unknown,
  label: string,
  max: number,
): { value: string } | { error: string } {
  if (typeof value !== 'string') {
    return { error: `${label} harus berupa teks` };
  }
  const text = value.trim();
  return text.length > max
    ? { error: `${label} maksimal ${max} karakter` }
    : { value: text };
}

function readDeadline(value: unknown): { value: string } | { error: string } {
  if (typeof value !== 'string' || value === '') {
    return { error: 'Tanggal deadline wajib diisi' };
  }
  return isCalendarDay(value)
    ? { value }
    : { error: 'Format tanggal deadline tidak valid' };
}

/**
 * `PATCH /contents/:id` with any of `{ deadline, brief, name }`. Only these are read, so a body
 * cannot reach the type, status or contract (OWASP A08). Which fields the content's type allows
 * is decided by planContentEdit, once the content is read.
 */
export function checkContentEdit(body: unknown): ContentEdit {
  const fields = asObject(body);
  const sent = (['deadline', 'brief', 'name'] as const).filter(
    (field) => fields !== null && field in fields,
  );
  if (fields === null || sent.length === 0) {
    throw invalid({
      content: 'Isi deadline, brief, atau nama konten yang diubah',
    });
  }

  const edit: ContentEdit = {};
  const errors: Record<string, string> = {};
  const readers: Record<
    EditedField,
    (value: unknown) => { value: string } | { error: string }
  > = {
    deadline: readDeadline,
    brief: (value) => readText(value, 'Brief', MAX_BRIEF_LENGTH),
    name: (value) => readText(value, 'Nama konten', MAX_CONTENT_NAME_LENGTH),
  };
  for (const field of sent) {
    const read = readers[field](fields[field]);
    if ('error' in read) {
      errors[field] = read.error;
    } else {
      edit[field] = read.value;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw invalid(errors);
  }
  return edit;
}

/**
 * AC 1, 9: only content still "Scheduled" with no draft may change, and only while its
 * contract's invoice runs. The draft is named first: it is the one the admin can see on the panel.
 */
export function assertChangeable(content: EditableContent): void {
  if (content.status !== 'scheduled' || content._count.submissions > 0) {
    throw new ConflictException({
      code: 'CONTENT_NOT_EDITABLE',
      message:
        'Konten hanya bisa diubah atau dihapus selama berstatus Scheduled dan belum ada draft',
    });
  }
  invoiceState(
    content.contracts.invoice?.status ?? 'running',
  ).assertCanChangeSchedule();
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** AC 3: the earliest-deadline rule from Tambah Konten, and the H-5 line before the contract end. */
function deadlineProblem(
  deadline: string,
  content: EditableContent,
  rules: SchedulingRules,
): string | undefined {
  const earliest = earliestDeadline(
    isoDay(content.contracts.start_date),
    rules.today,
    rules.bufferDays,
  );
  const latest = latestDeadline(isoDay(content.contracts.end_date));
  if (deadline < earliest) {
    return `Deadline paling cepat ${readableDay(earliest)}`;
  }
  if (deadline > latest) {
    return `Deadline paling lambat ${readableDay(latest)} (H-5 akhir kontrak)`;
  }
  return undefined;
}

/** `Evg_<sequence>_…`: the sequence an Evergreen name was given, or null for any other name. */
const EVERGREEN_SEQUENCE = /^Evg_(\d+)_/;

/** An Evergreen name carries its deadline, so a new deadline renames it under the same sequence. */
function evergreenRename(content: EditableContent, deadline: string): string {
  const sequence = EVERGREEN_SEQUENCE.exec(content.name);
  if (!sequence) {
    return content.name;
  }
  const { first_name, middle_name, last_name } = content.contracts.creators;
  const fullName = [first_name, middle_name, last_name]
    .filter(Boolean)
    .join(' ');
  return evergreenName(fullName, deadline, Number(sequence[1]));
}

/**
 * What an edit writes (AC 2, 3). A field sent with its current value is no change, and a deadline
 * that does not move is not judged again, so a brief can still be fixed on content already inside
 * the buffer. Every problem is answered at once.
 */
export function planContentEdit(
  content: EditableContent,
  edit: ContentEdit,
  rules: SchedulingRules,
): ContentEditPlan {
  const errors: Record<string, string> = {};
  const current = {
    deadline: isoDay(content.deadline),
    brief: content.brief,
    name: content.name,
  };
  const moved =
    edit.deadline !== undefined && edit.deadline !== current.deadline;

  if (edit.name !== undefined && edit.name !== current.name) {
    if (content.type === 'evergreen') {
      errors.name =
        'Nama konten Evergreen dibuat otomatis dan tidak bisa diubah';
    } else if (edit.name === '') {
      errors.name = 'Nama konten wajib diisi';
    }
  }
  if (edit.brief === '' && content.type === 'specific') {
    errors.brief = 'Brief wajib diisi';
  }
  const late = moved
    ? deadlineProblem(edit.deadline!, content, rules)
    : undefined;
  if (late) {
    errors.deadline = late;
  }
  if (Object.keys(errors).length > 0) {
    throw invalid(errors);
  }

  const next = {
    deadline: edit.deadline ?? current.deadline,
    brief: edit.brief ?? current.brief,
    name:
      content.type === 'evergreen'
        ? moved
          ? evergreenRename(content, edit.deadline!)
          : current.name
        : (edit.name ?? current.name),
  };

  const plan: ContentEditPlan = { data: {}, changes: {} };
  for (const field of ['deadline', 'brief', 'name'] as const) {
    if (next[field] === current[field]) {
      continue;
    }
    plan.changes[field] = { from: current[field], to: next[field] };
    if (field === 'deadline') {
      plan.data.deadline = new Date(`${next.deadline}T00:00:00Z`);
    } else {
      plan.data[field] = next[field];
    }
  }
  return plan;
}
