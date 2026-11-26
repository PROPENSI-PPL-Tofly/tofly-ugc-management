import { Injectable, type ExecutionContext } from '@nestjs/common';
import { AdminGuard, forbidden, type AdminRequest } from './admin.guard.js';

const SUPER_ADMIN_ONLY = 'Halaman ini hanya untuk Super Admin';

/**
 * Super Admin routes (PBI-23): "Pengguna Admin", "Log Aktivitas" and "Atur Buffer Deadline".
 * Everything AdminGuard checks, and then that the whitelist, asked on this request, still calls the
 * Admin a Super Admin; anyone else gets 403 (OWASP A01:2025). Open/Closed: AdminGuard is reused as
 * it is, and this adds one rule on top.
 */
@Injectable()
export class SuperAdminGuard extends AdminGuard {
  protected override readonly forbiddenMessage = SUPER_ADMIN_ONLY;

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const { principal } = context.switchToHttp().getRequest<AdminRequest>();
    // No principal only under AdminGuard's local stand-in, which production never honours.
    if (principal === undefined) return true;
    if (principal.role !== 'admin' || principal.adminRole !== 'super_admin') {
      throw forbidden(SUPER_ADMIN_ONLY);
    }
    return true;
  }
}
