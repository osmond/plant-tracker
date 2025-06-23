# Plant Tracker

This is a simple PHP-based application for tracking plants.

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

