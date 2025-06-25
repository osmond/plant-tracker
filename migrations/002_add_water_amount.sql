-- Convert water_amount to DECIMAL for more accurate storage
ALTER TABLE plants
    MODIFY COLUMN water_amount DECIMAL(8,2) NOT NULL DEFAULT 0;
