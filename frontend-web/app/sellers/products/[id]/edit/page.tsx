'use client';

import { useParams } from 'next/navigation';
import ProductForm from '@/components/sellers/product-form/ProductForm';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  return <ProductForm key={id} mode="edit" productId={id} />;
}
