-- Add archived column to allow soft deletion
ALTER TABLE plants
    ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0;
