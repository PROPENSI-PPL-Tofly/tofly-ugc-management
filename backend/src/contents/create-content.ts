import { UnprocessableEntityException } from "@nestjs/common";
import type { content_type } from "@prisma/client";

export const DEFAULT_BUFFER_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 200;
const MAX_BRIEF_LENGTH = 5000;

const UUID_FORMAT =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateContent {
  creatorId: string;
  type: content_type;
  name: string;
  brief: string;
  deadline: Date;
}

export interface CreateContentContext {
  today: Date;
  contractStart: Date;
  contractEnd: Date;
  quota: number;
  totalContentCount: number;
  evergreenCount: number;
}

export type CreateContentErrors = Partial<
    Record<
        "creatorId" | "type" | "name" | "brief" | "deadline" | "quota",
        string
    >
>;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function startOfDay(now: Date): Date {
  return new Date(
      Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
      ),
  );
}

function toDay(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const day = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(day.getTime()) &&
  day.toISOString().slice(0, 10) === value
      ? day
      : null;
}

function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

export function checkCreateContent(
    input: unknown,
    context: CreateContentContext,
): CreateContent {
  const body: Record<string, unknown> = {
    ...((input as object | null) ?? {}),
  };

  const errors: CreateContentErrors = {};

  const creatorId = trimmed(body.creatorId);

  if (creatorId === "") {
    errors.creatorId = "Creator wajib dipilih";
  } else if (!UUID_FORMAT.test(creatorId)) {
    errors.creatorId = "Creator tidak valid";
  }

  const type = body.type;

  if (type !== "evergreen" && type !== "specific") {
    errors.type = "Jenis konten harus Evergreen atau Specific";
  }

  const rawName = trimmed(body.name);
  const rawBrief = trimmed(body.brief);

  if (type === "specific") {
    if (rawName === "") {
      errors.name = "Nama konten wajib diisi";
    } else if (rawName.length > MAX_NAME_LENGTH) {
      errors.name = `Nama konten maksimal ${MAX_NAME_LENGTH} karakter`;
    }

    if (rawBrief === "") {
      errors.brief = "Brief wajib diisi";
    } else if (rawBrief.length > MAX_BRIEF_LENGTH) {
      errors.brief = `Brief maksimal ${MAX_BRIEF_LENGTH} karakter`;
    }
  }

  const deadline = toDay(body.deadline);

  if (!deadline) {
    errors.deadline = "Tanggal deadline tidak valid";
  } else {
    const today = startOfDay(context.today);
    const contractStart = startOfDay(context.contractStart);
    const contractEnd = startOfDay(context.contractEnd);

    const earliest = new Date(
        Math.max(today.getTime(), contractStart.getTime()) +
        DEFAULT_BUFFER_DAYS * DAY_MS,
    );

    if (deadline < earliest) {
      errors.deadline = `Deadline paling cepat ${isoDay(earliest)}`;
    } else if (deadline > contractEnd) {
      errors.deadline = "Deadline tidak boleh setelah akhir kontrak";
    }
  }

  if (context.totalContentCount >= context.quota) {
    errors.quota = "Kuota content sudah penuh";
  }

  if (
      type === "evergreen" &&
      context.evergreenCount >= context.quota
  ) {
    errors.type = "Kuota Evergreen sudah penuh";
  }

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: "Data content tidak valid",
      errors,
    });
  }

  return {
    creatorId,
    type: type as content_type,
    name: type === "specific" ? rawName : "",
    brief: type === "specific" ? rawBrief : "",
    deadline: deadline as Date,
  };
}