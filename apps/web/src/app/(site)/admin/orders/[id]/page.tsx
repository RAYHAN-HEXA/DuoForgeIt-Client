import { AdminOrderDetailContent } from './order-detail';

/** Prerendering fights the auth-guarded client shell — render at request time. */
export const instant = false;

export default function AdminOrderDetailPage() {
  return <AdminOrderDetailContent />;
}
