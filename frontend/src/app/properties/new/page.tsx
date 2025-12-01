'use client';

import React from 'react';
import { PropertyForm } from '@/components/properties/PropertyForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function CreatePropertyPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/properties" className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} className="mr-1" />
          Back to Properties
        </Link>
      </div>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Add New Property</h1>
        <PropertyForm />
      </div>
    </div>
  );
}
