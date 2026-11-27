import { MeDashboardController } from './me-dashboard.controller.js';

describe('the creator dashboard controller', () => {
  const dashboard = vi.fn().mockResolvedValue({ sent: 1, quota: 5 });
  const controller = new MeDashboardController({ dashboard } as never);

  afterEach(() => vi.clearAllMocks());

  it('passes the guard-resolved creator id to the service', async () => {
    const result = await creatorDashboard(controller, 'ana');

    expect(dashboard).toHaveBeenCalledWith('ana');
    expect(result).toEqual({ sent: 1, quota: 5 });
  });
});

/** The decorated method takes its id from @CurrentCreator; the test calls it with that id. */
function creatorDashboard(controller: MeDashboardController, id: string) {
  return (controller as unknown as { list: (id: string) => unknown }).list(id);
}
