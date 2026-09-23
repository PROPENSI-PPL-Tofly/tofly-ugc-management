import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCreatorDto } from './create-creator.dto.js';

function makeDto(overrides: Record<string, unknown> = {}): CreateCreatorDto {
  return plainToInstance(CreateCreatorDto, {
    firstName: 'Rangga',
    email: 'rangga@example.com',
    contractStart: '2026-10-01',
    contractEnd: '2026-12-31',
    contentQuota: 6,
    daysBetween: 14,
    fixedRate: 500000,
    ...overrides,
  });
}

describe('CreateCreatorDto', () => {
  it('passes with valid data', async () => {
    const dto = makeDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('requires firstName', async () => {
    const dto = makeDto({ firstName: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });

  it('requires email', async () => {
    const dto = makeDto({ email: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects invalid email', async () => {
    const dto = makeDto({ email: 'not-an-email' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('requires contractStart', async () => {
    const dto = makeDto({ contractStart: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contractStart')).toBe(true);
  });

  it('requires contractEnd', async () => {
    const dto = makeDto({ contractEnd: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contractEnd')).toBe(true);
  });

  it('requires contentQuota', async () => {
    const dto = makeDto({ contentQuota: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contentQuota')).toBe(true);
  });

  it('rejects contentQuota less than 1', async () => {
    const dto = makeDto({ contentQuota: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contentQuota')).toBe(true);
  });

  it('requires daysBetween', async () => {
    const dto = makeDto({ daysBetween: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'daysBetween')).toBe(true);
  });

  it('rejects daysBetween less than 1', async () => {
    const dto = makeDto({ daysBetween: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'daysBetween')).toBe(true);
  });

  it('requires fixedRate', async () => {
    const dto = makeDto({ fixedRate: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'fixedRate')).toBe(true);
  });

  it('rejects fixedRate less than 0', async () => {
    const dto = makeDto({ fixedRate: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'fixedRate')).toBe(true);
  });

  it('accepts optional manualSlotDate', async () => {
    const dto = makeDto({ manualSlotDate: '2026-10-15' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid manualSlotDate format', async () => {
    const dto = makeDto({ manualSlotDate: 'not-a-date' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'manualSlotDate')).toBe(true);
  });
});
