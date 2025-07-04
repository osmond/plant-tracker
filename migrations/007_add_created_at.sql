-- Add created_at column to track when a plant was added
ALTER TABLE plants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
