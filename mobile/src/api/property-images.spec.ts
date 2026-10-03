import { propertyImageUrl } from './property-images';

it('resolves relative images and signed previews against the API path', () => {
  const base = 'https://rent.maese.com.ar/api/';
  expect(propertyImageUrl('/properties/images/photo', base)).toBe(
    'https://rent.maese.com.ar/api/properties/images/photo',
  );
  expect(
    propertyImageUrl('properties/images/photo?expires=123&signature=abc', base),
  ).toBe(
    'https://rent.maese.com.ar/api/properties/images/photo?expires=123&signature=abc',
  );
});

it('preserves external and already normalized image URLs', () => {
  expect(propertyImageUrl('https://cdn.example/photo.jpg')).toBe(
    'https://cdn.example/photo.jpg',
  );
  expect(
    propertyImageUrl('https://rent.maese.com.ar/api/properties/images/photo'),
  ).toBe('https://rent.maese.com.ar/api/properties/images/photo');
  expect(propertyImageUrl('')).toBe('');
});
