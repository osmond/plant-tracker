-- Add columns for OpenFarm metadata
ALTER TABLE plants
    ADD COLUMN IF NOT EXISTS scientific_name VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(255) NULL;
