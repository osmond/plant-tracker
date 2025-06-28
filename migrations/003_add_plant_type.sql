-- Adds plant_type column to plants table to store the type/category of each plant
ALTER TABLE plants
    ADD COLUMN plant_type VARCHAR(50) NOT NULL DEFAULT 'houseplant';
