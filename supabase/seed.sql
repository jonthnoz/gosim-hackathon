-- One sample listing for development. Photo URLs point to muscache.com (Inside Airbnb hero CDN).
insert into listings (source, source_id, name, description, photo_urls, external_url, city, neighborhood)
values (
  'inside_airbnb', '2721397',
  'Marais - Charming loft, river view',
  E'### About this place\nOriginal beams, parquet floors, tall windows looking onto the river.\n\n### The neighborhood\nHôtel-de-Ville, Le Marais. Three minutes to Place des Vosges, ten to Notre-Dame.\n\n### Beds & baths\n1 bedroom, 1 bath, sleeps 2.\n\n### Amenities\nWiFi, kitchen, washer.',
  ARRAY[
    'https://a0.muscache.com/im/pictures/295786e7-116c-4c62-b450-b91bffea8eb0.jpg?im_w=1920',
    'https://a0.muscache.com/im/pictures/d9153ab2-b451-49c9-bcf3-43200199414b.jpg?im_w=1920'
  ],
  'https://www.airbnb.com/rooms/2721397',
  'Paris',
  'Hôtel-de-Ville'
)
on conflict (source, source_id) do nothing;
