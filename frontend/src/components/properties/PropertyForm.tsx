import React, { useEffect } from 'react';
import { useForm, useFieldArray, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CreatePropertyInput, Property, PropertyType, PropertyStatus } from '@/types/property';
import { ImageUpload } from './ImageUpload';
import { propertiesApi } from '@/lib/api/properties';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const propertySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['APARTMENT', 'HOUSE', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER'] as const),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const).optional(),
  address: z.object({
    street: z.string().min(1, 'Street is required'),
    number: z.string().min(1, 'Number is required'),
    unit: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    zipCode: z.string().min(1, 'Zip Code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
  features: z.array(z.object({
    name: z.string().min(1, 'Feature name is required'),
    value: z.string().optional(),
  })).optional(),
  images: z.array(z.string()).optional(),
  ownerId: z.string().min(1, 'Owner ID is required'),
});

type PropertyFormData = z.infer<typeof propertySchema>;

interface PropertyFormProps {
  initialData?: Property;
  isEditing?: boolean;
}

export function PropertyForm({ initialData, isEditing = false }: PropertyFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema) as Resolver<PropertyFormData>,
    defaultValues: initialData ? {
      ...initialData,
      features: initialData.features.map(f => ({ name: f.name, value: f.value })),
    } : {
      type: 'APARTMENT',
      status: 'ACTIVE',
      images: [],
      features: [],
      ownerId: 'current-user-id', // TODO: Get from auth context
      address: {
          country: 'Argentina' // Default
      }
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'features',
  });

  const images = watch('images') || [];

  const onSubmit = async (data: PropertyFormData) => {
    setIsSubmitting(true);
    try {
      if (isEditing && initialData) {
        await propertiesApi.update(initialData.id, data);
        router.push(`/properties/${initialData.id}`);
      } else {
        const newProperty = await propertiesApi.create(data as CreatePropertyInput);
        router.push(`/properties/${newProperty.id}`);
      }
      router.refresh();
    } catch (error) {
      console.error('Error saving property:', error);
      alert('Failed to save property');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    return await propertiesApi.uploadImage(file);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
            <input
              id="name"
              {...register('name')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
              placeholder="e.g. Sunset Apartments"
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
          </div>
          
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">Type</label>
            <select
              id="type"
              {...register('type')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            >
              <option value="APARTMENT">Apartment</option>
              <option value="HOUSE">House</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="OFFICE">Office</option>
              <option value="LAND">Land</option>
              <option value="OTHER">Other</option>
            </select>
            {errors.type && <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>}
          </div>

          {isEditing && (
             <div>
             <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
             <select
               id="status"
               {...register('status')}
               className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
             >
               <option value="ACTIVE">Active</option>
               <option value="INACTIVE">Inactive</option>
               <option value="MAINTENANCE">Maintenance</option>
             </select>
           </div>
          )}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            id="description"
            {...register('description')}
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            placeholder="Property description..."
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Location</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="street" className="block text-sm font-medium text-gray-700">Street</label>
            <input id="street" {...register('address.street')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            {errors.address?.street && <p className="mt-1 text-sm text-red-600">{errors.address.street.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label htmlFor="number" className="block text-sm font-medium text-gray-700">Number</label>
                <input id="number" {...register('address.number')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                {errors.address?.number && <p className="mt-1 text-sm text-red-600">{errors.address.number.message}</p>}
            </div>
            <div>
                <label htmlFor="unit" className="block text-sm font-medium text-gray-700">Unit (Optional)</label>
                <input id="unit" {...register('address.unit')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            </div>
          </div>
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700">City</label>
            <input id="city" {...register('address.city')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            {errors.address?.city && <p className="mt-1 text-sm text-red-600">{errors.address.city.message}</p>}
          </div>
          <div>
            <label htmlFor="state" className="block text-sm font-medium text-gray-700">State</label>
            <input id="state" {...register('address.state')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            {errors.address?.state && <p className="mt-1 text-sm text-red-600">{errors.address.state.message}</p>}
          </div>
          <div>
            <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700">Zip Code</label>
            <input id="zipCode" {...register('address.zipCode')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            {errors.address?.zipCode && <p className="mt-1 text-sm text-red-600">{errors.address.zipCode.message}</p>}
          </div>
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700">Country</label>
            <input id="country" {...register('address.country')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
            {errors.address?.country && <p className="mt-1 text-sm text-red-600">{errors.address.country.message}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Images</h3>
        <ImageUpload
          images={images}
          onChange={(newImages) => setValue('images', newImages)}
          onUpload={handleImageUpload}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-lg font-medium text-gray-900">Features</h3>
            <button
                type="button"
                onClick={() => append({ name: '', value: '' })}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                <Plus size={16} className="mr-1" />
                Add Feature
            </button>
        </div>
        
        <div className="space-y-2">
            {fields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-2">
                    <div className="flex-1">
                        <input
                            {...register(`features.${index}.name`)}
                            placeholder="Feature Name (e.g. Pool)"
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        />
                         {errors.features?.[index]?.name && <p className="mt-1 text-sm text-red-600">{errors.features[index]?.name?.message}</p>}
                    </div>
                    <div className="flex-1">
                        <input
                            {...register(`features.${index}.value`)}
                            placeholder="Value (Optional)"
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-2 text-red-600 hover:text-red-800"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            ))}
            {fields.length === 0 && (
                <p className="text-sm text-gray-500 italic">No features added yet.</p>
            )}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <button
          type="button"
          onClick={() => router.back()}
          className="mr-3 px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
              Saving...
            </>
          ) : (
            'Save Property'
          )}
        </button>
      </div>
    </form>
  );
}
