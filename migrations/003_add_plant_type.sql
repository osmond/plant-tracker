-- Add plant_type column for tracking type of plant
ALTER TABLE plants
    ADD COLUMN plant_type VARCHAR(20) NOT NULL DEFAULT 'houseplant';
