# Plant Tracker

This is a simple PHP-based application for tracking plants.
You can filter plants that need watering or fertilizing to focus on urgent tasks.

## Running Tests

The project includes a minimal PHPUnit test suite for the API endpoints. To run the tests:

1. Install PHPUnit if it is not already available. On Ubuntu you can run:
   ```bash
   sudo apt-get update && sudo apt-get install -y phpunit
   ```
2. Execute PHPUnit from the repository root:
   ```bash
   phpunit --configuration phpunit.xml
   ```

The tests use a stub database connection and do not require a real database.

## Configuration

Set the following environment variables so `db.php` can establish the database connection:

- `DB_HOST` - database host, defaults to `localhost` if unset
- `DB_USER` - database user
- `DB_PASS` - user password
- `DB_NAME` - name of the database

`db.php` reads these values using `getenv`. Ensure the variables are available in
your environment (or defined in a `.env` file loaded by your web server) before
running the application so credentials are not stored in the codebase.

## Plant Events

Actions like watering or fertilizing are logged to a `plant_events` table. Create
the table using SQL similar to:

```sql
CREATE TABLE plant_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plant_id INT NOT NULL,
    event_type ENUM('watered', 'fertilized') NOT NULL,
    event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
);
```

The endpoint `api/get_history.php` returns aggregated counts of events per plant.

## Notes and Photos

Plants can optionally store text notes and a photo. Update your database table to include these columns:

```sql
ALTER TABLE plants
  ADD COLUMN notes TEXT,
  ADD COLUMN photo_path VARCHAR(255);
```

Uploaded images are saved in the `uploads/` directory.

