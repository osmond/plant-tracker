# Plant Tracker

Plant Tracker is a lightweight PHP and JavaScript application for keeping tabs on your plants. It lets you filter which ones need watering or fertilizing and provides a drag-and-drop calendar for rescheduling upcoming tasks. Room tags are color coded automatically so you can easily see where each plant lives.

## Requirements

- PHP 7.4+ with the `mysqli` extension
- MySQL or MariaDB
- (optional) an OpenWeather API key if you want to display local weather

## Getting Started

1. Clone the repository and install any PHP dependencies you need for testing.
2. Configure the database connection as described in **Configuration** below.
3. Apply the migrations in the `migrations/` directory:
   ```bash
   mysql -u <user> -p <database> < migrations/001_add_water_amount.sql
   mysql -u <user> -p <database> < migrations/002_add_water_amount.sql
   ```
   The first script adds the column if it does not exist. The second modifies it to DECIMAL(8,2) for consistent precision.
4. Launch a local development server:
   ```bash
   php -S localhost:8000
   ```
   Then open `http://localhost:8000/index.html` in your browser.

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

`db.php` reads these values using `getenv`. Alternatively you can set `DB_CONFIG` to the path of a PHP file that defines `$host`, `$user`, `$pass` and `$dbname`. Ensure these variables are available in your environment (or defined in a `.env` file loaded by your web server) before running the application so credentials are not stored in the codebase.

To use the optional weather lookup feature, provide your OpenWeather API key at runtime.
Add a meta tag such as `<meta name="weather-api-key" content="YOUR_KEY">` to
`index.html` or set `window.WEATHER_API_KEY` before `script.js` loads. The
script reads the value from either location so deployments can supply the key
without modifying the source files.

## Usage

Once the migration is applied, each plant entry includes a `water_amount` value that indicates how much water it typically receives. Enter the amount in fluid ounces and the UI shows the equivalent in milliliters. The value is stored in milliliters so you can work in either unit as needed.

Uploaded photos are placed in the `uploads` directory. When a plant is updated with a new image or removed entirely, the previous photo is moved to `uploads/archive/` rather than deleted. If a name collision occurs, a timestamp is appended so the older file is preserved.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
