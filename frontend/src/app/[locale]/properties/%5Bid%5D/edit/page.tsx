'use client';

import React, { useEffect, useState } from 'react';
import { PropertyForm } from '@/components/properties/PropertyForm';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { propertiesApi } from '@/lib/api/properties';
import { Property } from '@/types/property';
import { useLocale } from 'next-intl';

export default function EditPropertyPage() {
  const params = useParams();
  const locale = useLocale();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (propertyId) {
      loadProperty(propertyId);
    }
  }, [propertyId]);

  const loadProperty = async (id: string) => {
    try {
      const data = await propertiesApi.getById(id);
      setProperty(data);
    } catch (error) {
      console.error('Failed to load property', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Property not found</h1>
        <Link href={`/${locale}/properties`} className="text-blue-600 hover:underline mt-4 inline-block">
          Back to Properties
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/${locale}/properties/${property.id}`} className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} className="mr-1" />
          Back to Property Details
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Edit Property</h1>
        <PropertyForm initialData={property} isEditing />
      </div>
    </div>
  );
}
