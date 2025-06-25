# Plant Tracker

This is a simple PHP-based application for tracking plants.
You can filter plants that need watering or fertilizing to focus on urgent tasks.
An optional calendar view lets you drag tasks to reschedule upcoming care dates.
Room tags now automatically get unique colors so it's easy to distinguish where each plant lives.

## Running Tests

The project includes a minimal PHPUnit test suite for the API endpoints.

1. **Install PHPUnit.** The `phpunit` command must be available before running the tests.
   On Ubuntu you can install it with:
   ```bash
   sudo apt-get update && sudo apt-get install -y phpunit
   ```
   Alternatively install it locally using Composer:
   ```bash
   composer require --dev phpunit/phpunit
   ```
2. Execute the tests from the repository root:
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

## Setup

Run the migration scripts to ensure the `water_amount` column exists and uses a
precise DECIMAL type:

```bash
mysql -u <user> -p <database> < migrations/001_add_water_amount.sql
mysql -u <user> -p <database> < migrations/002_add_water_amount.sql
```

The first script adds the column if it's missing. The second upgrades the
column to use DECIMAL(8,2) so each record stores the amount of water in
milliliters with consistent precision.

This script alters the existing `plants` table so each record stores the amount
of water to give the plant. The `water_amount` column is measured in
milliliters (ml).

## Usage

Once the migration is applied, each plant entry includes a `water_amount` value
that indicates how much water it typically receives. Enter the amount in fluid
ounces and the UI shows the equivalent in milliliters. The value is stored in
milliliters so you can work in either unit as needed.


