-- Add scientific_name and thumbnail_url columns to plants
ALTER TABLE plants
  ADD COLUMN scientific_name VARCHAR(255) NULL,
  ADD COLUMN thumbnail_url   VARCHAR(512) NULL;
