-- Add plant_type column to store user-selected plant type
ALTER TABLE plants
    ADD COLUMN plant_type VARCHAR(20) NOT NULL DEFAULT 'houseplant';
