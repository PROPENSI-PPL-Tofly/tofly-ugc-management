import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ManualSlotDto } from './manual-slot.dto.js';

function makeDto(overrides: Record<string, unknown> = {}): ManualSlotDto {
  return plainToInstance(ManualSlotDto, {
    contentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    deadline: '2026-10-15',
    ...overrides,
  });
}

describe('ManualSlotDto', () => {
  it('passes with valid data', async () => {
    const dto = makeDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('requires contentId', async () => {
    const dto = makeDto({ contentId: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contentId')).toBe(true);
  });

  it('rejects invalid UUID for contentId', async () => {
    const dto = makeDto({ contentId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contentId')).toBe(true);
  });

  it('requires deadline', async () => {
    const dto = makeDto({ deadline: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'deadline')).toBe(true);
  });

  it('rejects invalid date format for deadline', async () => {
    const dto = makeDto({ deadline: 'not-a-date' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'deadline')).toBe(true);
  });

  it('rejects deadline with time component', async () => {
    const dto = makeDto({ deadline: '2026-10-15T10:30:00' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'deadline')).toBe(true);
  });
});
