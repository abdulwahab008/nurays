import orderPlacement, { OrderPlacement } from './order-placement.service';
import orderQueries, { OrderQueries } from './order-queries.service';
import orderCancellation, { OrderCancellation } from './order-cancel.service';
import orderPayments, { OrderPayments } from './order-payment.service';
import orderChat, { OrderChat } from './order-chat.service';

/**
 * Orders: the one door the controllers, the jobs and the scripts go through. The work itself is in five files, one per
 * concern, so none of them is longer than the order of a screen or two can follow:
 *
 *  - order-placement.service.ts  placing an order (pricing, discounts, the split by kitchen, stock, the transaction)
 *  - order-queries.service.ts    a customer's list, and one order as each party to it may see it
 *  - order-cancel.service.ts     cancelling, and what a cancellation sets right
 *  - order-payment.service.ts    payment by bank transfer: submitting it, confirming it
 *  - order-chat.service.ts       the conversation on an order
 */
export class OrderService {
  createOrder(...args: Parameters<OrderPlacement['createOrder']>) {
    return orderPlacement.createOrder(...args);
  }

  getUserOrders(...args: Parameters<OrderQueries['getUserOrders']>) {
    return orderQueries.getUserOrders(...args);
  }

  getOrderDetails(...args: Parameters<OrderQueries['getOrderDetails']>) {
    return orderQueries.getOrderDetails(...args);
  }

  cancelOrder(...args: Parameters<OrderCancellation['cancelOrder']>) {
    return orderCancellation.cancelOrder(...args);
  }

  getSellerPaymentDetails(...args: Parameters<OrderPayments['getSellerPaymentDetails']>) {
    return orderPayments.getSellerPaymentDetails(...args);
  }

  submitManualPayment(...args: Parameters<OrderPayments['submitManualPayment']>) {
    return orderPayments.submitManualPayment(...args);
  }

  confirmManualPayment(...args: Parameters<OrderPayments['confirmManualPayment']>) {
    return orderPayments.confirmManualPayment(...args);
  }

  adminConfirmManualPayment(...args: Parameters<OrderPayments['adminConfirmManualPayment']>) {
    return orderPayments.adminConfirmManualPayment(...args);
  }

  getOrderMessages(...args: Parameters<OrderChat['getOrderMessages']>) {
    return orderChat.getOrderMessages(...args);
  }

  sendOrderMessage(...args: Parameters<OrderChat['sendOrderMessage']>) {
    return orderChat.sendOrderMessage(...args);
  }
}

export default new OrderService();
