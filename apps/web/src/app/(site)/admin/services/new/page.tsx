import { ServiceForm } from '@/components/admin/service-form';

/** Prerendering fights the auth-guarded admin shell — render at request time. */
export const instant = false;

export default function NewServicePage() {
  return <ServiceForm />;
}
