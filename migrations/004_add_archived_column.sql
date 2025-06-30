-- Add archived column to track inactive plants
ALTER TABLE plants
    ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0;
