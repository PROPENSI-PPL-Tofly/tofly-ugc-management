import { Controller, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';

// Not written yet; the spec beside this file says what it has to do.
@Controller('contents')
@UseGuards(AdminGuard)
export class ContentListController {}
