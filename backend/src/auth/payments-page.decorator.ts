import { SetMetadata } from '@nestjs/common';

// PBI-37 (AC 13): while a creator only waits for payment, "Pembayaran" is the one page left to
// them. The controllers behind it carry this mark; DevCreatorGuard refuses every other one.

export const PAYMENTS_PAGE = 'tofly:payments-page';

/** Marks a creator controller as part of "Pembayaran". */
export const PaymentsPage = (): ClassDecorator => SetMetadata(PAYMENTS_PAGE, true);

/** Whether the controller is part of "Pembayaran". */
export function isPaymentsPage(controller: object): boolean {
  return Reflect.getMetadata(PAYMENTS_PAGE, controller) === true;
}
