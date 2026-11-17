import {
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { CreatorOrAdminGuard } from './creator-or-admin.guard.js';

const context = {} as ExecutionContext;

function guards(
  creator: CanActivate['canActivate'],
  admin: CanActivate['canActivate'],
) {
  const creatorGuard = { canActivate: vi.fn(creator) };
  const adminGuard = { canActivate: vi.fn(admin) };
  return {
    creatorGuard,
    adminGuard,
    guard: new CreatorOrAdminGuard(creatorGuard, adminGuard),
  };
}

describe('CreatorOrAdminGuard', () => {
  it('admits a creator through the creator guard alone', async () => {
    const { guard, adminGuard } = guards(
      () => Promise.resolve(true),
      () => Promise.resolve(true),
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminGuard.canActivate).not.toHaveBeenCalled();
  });

  it.each([
    ['not signed in as a creator', new UnauthorizedException()],
    ['signed in as an admin', new ForbiddenException()],
  ])('asks the admin guard when the caller is %s', async (_why, refusal) => {
    const { guard, adminGuard } = guards(
      () => Promise.reject(refusal),
      () => Promise.resolve(true),
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminGuard.canActivate).toHaveBeenCalledWith(context);
  });

  it("answers with the admin guard's refusal when neither admits the caller", async () => {
    const adminRefusal = new ForbiddenException(
      'Halaman ini hanya untuk Admin',
    );
    const { guard } = guards(
      () => Promise.reject(new ForbiddenException()),
      () => Promise.reject(adminRefusal),
    );

    await expect(guard.canActivate(context)).rejects.toBe(adminRefusal);
  });

  it('lets any other failure of the creator guard through without trying the admin guard', async () => {
    const failure = new Error('session store down');
    const { guard, adminGuard } = guards(
      () => Promise.reject(failure),
      () => Promise.resolve(true),
    );

    await expect(guard.canActivate(context)).rejects.toBe(failure);
    expect(adminGuard.canActivate).not.toHaveBeenCalled();
  });

  it('never admits a caller the creator guard turned down without throwing', async () => {
    const { guard } = guards(
      () => false,
      () => Promise.resolve(true),
    );

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });
});
