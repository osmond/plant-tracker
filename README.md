# Plant Tracker

Plant Tracker is a lightweight PHP and JavaScript application for keeping tabs on your plants. It lets you filter which ones need watering or fertilizing and provides a drag-and-drop calendar for rescheduling upcoming tasks. Room tags are color coded automatically so you can easily see where each plant lives.

## Requirements

- PHP 7.4+ with the `mysqli` extension
- MySQL or MariaDB
- (optional) the **Imagick** PHP extension to convert uploaded images to WebP
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

If you want to use the weather lookup feature, edit `script.js` and replace the `WEATHER_API_KEY` constant with your own OpenWeather API key.

## Usage

Once the migration is applied, each plant entry includes a `water_amount` value that indicates how much water it typically receives. Enter the amount in fluid ounces and the UI shows the equivalent in milliliters. The value is stored in milliliters so you can work in either unit as needed.

Uploaded photos are placed in the `uploads` directory. When a plant is updated with a new image or removed entirely, the previous photo is moved to `uploads/archive/` rather than deleted. If a name collision occurs, a timestamp is appended so the older file is preserved.
If the Imagick extension is available, uploaded JPEG or PNG images are automatically converted to the WebP format to reduce file size.
## Automated Daily JSON Backup

To keep a day-by-day backup of your plant data, we use a simple cron job that runs every night, fetches the JSON from our API endpoint, and saves it into a timestamped file.

### 1. Create a backup directory

Make sure you have a folder to hold your dumps:

```bash
mkdir -p ~/backups/plants
2. Write the cron command
We use either curl or wget to pull down the JSON and name the file with the current date (YYYY-MM-DD). In crontab, percent signs (%) must be escaped as \%, so we do:

With curl:

bash
Copy
Edit
/usr/bin/curl -s "https://your-domain.com/api/get_plants.php" \
  -o "/home/u568785491/backups/plants/plants-$(date +\%Y-\%m-\%d).json"
With wget:

bash
Copy
Edit
/usr/bin/wget -qO "/home/u568785491/backups/plants/plants-$(date +\%Y-\%m-\%d).json" \
  "https://your-domain.com/api/get_plants.php"
Flags explained:

-s / -q – suppress progress output

-O / -o <file> – write output to the given filename

$(date +\%Y-\%m-\%d) – injects today’s date; the backslash escapes the % for cron

3. Schedule it in cron
In your host’s Cron Jobs UI (or in a crontab -e), set it to run at 2 AM every day:

Minute	Hour	Day	Month	Weekday	Command
0	2	*	*	*	your curl/wget line above

That line is equivalent to:

ruby
Copy
Edit
0 2 * * * /usr/bin/curl -s "https://your-domain.com/api/get_plants.php" \
  -o "/home/u568785491/backups/plants/plants-$(date +\%Y-\%m-\%d).json"
## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
