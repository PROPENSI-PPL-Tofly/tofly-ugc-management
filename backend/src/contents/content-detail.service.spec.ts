import { NotFoundException } from '@nestjs/common';
import { ContentDetailService, type ContentDetailClient } from './content-detail.service.js';

const NOW = new Date('2026-09-20T10:00:00.000Z');

function prismaStub() {
  return { contents: { findFirst: vi.fn() } };
}

function row() {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Evg_Test 1',
    type: 'evergreen' as const,
    brief: '',
    deadline: new Date('2026-09-30T00:00:00.000Z'),
    status: 'scheduled' as const,
    video_link: null,
    video_submitted_at: null,
    approval_bypassed: false,
    created_at: new Date('2026-09-01T03:00:00.000Z'),
    updated_at: new Date('2026-09-01T03:00:00.000Z'),
    contracts: {
      creators: { first_name: 'Rangga', middle_name: null, last_name: 'Pratama' },
    },
    submissions: [],
  };
}

function service(prisma: ReturnType<typeof prismaStub>) {
  return new ContentDetailService(prisma as unknown as ContentDetailClient);
}

describe('ContentDetailService', () => {
  it('reads one content with its creator and hand-ins and answers the detail', async () => {
    const prisma = prismaStub();
    prisma.contents.findFirst.mockResolvedValue(row());

    const detail = await service(prisma).getDetail(
      '11111111-1111-1111-1111-111111111111',
      NOW,
    );

    expect(prisma.contents.findFirst).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      select: expect.objectContaining({
        id: true,
        status: true,
        video_submitted_at: true,
        approval_bypassed: true,
        contracts: expect.anything(),
        submissions: expect.objectContaining({
          select: expect.objectContaining({ creator_notes: true }),
        }),
      }),
    });
    expect(detail).toMatchObject({
      id: '11111111-1111-1111-1111-111111111111',
      creatorName: 'Rangga Pratama',
      deadline: '2026-09-30',
      waitingOn: 'creator',
      tags: [],
      creatorActions: ['submit_draft'],
    });
  });

  it('judges the tags at the moment of the read', async () => {
    const prisma = prismaStub();
    prisma.contents.findFirst.mockResolvedValue(row());

    const detail = await service(prisma).getDetail(
      '11111111-1111-1111-1111-111111111111',
      new Date('2026-10-05T05:00:00.000Z'),
    );

    expect(detail.tags).toEqual(['overdue']);
  });

  it('scopes a creator read to their own contract', async () => {
    const prisma = prismaStub();
    prisma.contents.findFirst.mockResolvedValue(row());

    await service(prisma).getDetail(
      '11111111-1111-1111-1111-111111111111',
      NOW,
      { creatorId: 'creator-1' },
    );

    expect(prisma.contents.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: '11111111-1111-1111-1111-111111111111',
          contracts: { creator_id: 'creator-1' },
        },
      }),
    );
  });

  it('answers 404 when the content does not exist', async () => {
    const prisma = prismaStub();
    prisma.contents.findFirst.mockResolvedValue(null);

    await expect(service(prisma).getDetail('missing', NOW)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('answers 404 to a creator asking for somebody else’s content, so the id never confirms it exists', async () => {
    const prisma = prismaStub();
    prisma.contents.findFirst.mockResolvedValue(null);

    await expect(
      service(prisma).getDetail('11111111-1111-1111-1111-111111111111', NOW, {
        creatorId: 'someone-else',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
