-- Add columns for OpenFarm metadata
ALTER TABLE plants
    ADD COLUMN scientific_name VARCHAR(100) NULL,
    ADD COLUMN thumbnail_url VARCHAR(255) NULL;
