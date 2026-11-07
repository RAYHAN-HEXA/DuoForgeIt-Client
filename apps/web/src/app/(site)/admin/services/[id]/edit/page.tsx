'use client';

import { useParams } from 'next/navigation';
import { ServiceEditor } from '@/components/admin/service-form';

export default function EditServicePage() {
  const { id } = useParams<{ id: string }>();
  return <ServiceEditor serviceId={id} />;
}
