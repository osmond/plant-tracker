-- Adds water_amount column to plants table for tracking how much water is given
ALTER TABLE plants
    ADD COLUMN water_amount DOUBLE NOT NULL DEFAULT 0;
