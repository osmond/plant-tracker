# Plant Tracker

Plant Tracker is a lightweight PHP application for managing your houseplants. It stores
plant records in a MySQL database and provides a simple web interface to track
watering and fertilizing. The project also includes small calculators for estimating
water requirements using local weather data.

![Plant Tracker dashboard screenshot](screenshot.png)

*Overview of the main interface listing plants and upcoming tasks.*

## Setup

1. Clone the repository and install PHP and MySQL.
2. Copy `config.example.php` to `config.php` and update the values:

```php
'openweather_key' => 'YOUR_API_KEY',
'location'        => 'City,Country',
'ra'              => 20.0,
'kc'              => 0.8,
'kc_map' => [
    'succulent'  => 0.3,
    'houseplant' => 0.8,
    'vegetable'  => 1.0,
    'flower'     => 0.9,
    'cacti'      => 0.28,
],
'bed_map' => [
    'vegetable' => [
        'kcb' => [
            'ini' => 0.3,
            'mid' => 1.05,
            'end' => 0.95,
        ],
        'kc_soil' => 1.1,
    ],
    'flower' => [
        'kcb' => [
            'ini' => 0.35,
            'mid' => 1.1,
            'end' => 1.0,
        ],
        'kc_soil' => 1.05,
    ],
],
```

   The OpenWeather API key and location are required for the water calculators.
3. Copy `db.example.php` to `db.php` and add your MySQL credentials. Tests can
   supply credentials via the `DB_CONFIG` environment variable using the stubs
   under `tests/`.
4. Run the database migrations:

```bash
php scripts/run_migrations.php
```

5. Start a local server from the project root:

```bash
php -S localhost:8000
```

   Then open `http://localhost:8000/index.html` in your browser.

   **Note:** Opening `index.html` directly as a file won't work because the
   JavaScript needs the PHP API endpoints. Always access the app through the
   local server above.

## Running Tests

PHPUnit tests are provided for the API endpoints. Ensure PHP is available on the
command line and that [PHPUnit is installed](https://phpunit.de/getting-started/phpunit-10.html).
Run them from the project root:

```bash
phpunit
```

The suite reads the `DB_CONFIG` environment variable to load a stubbed
database connection. The provided stubs live under `tests/` and allow the
API code to run without a real MySQL server. You can override the path
explicitly when running the tests:

```bash
DB_CONFIG=tests/db_stub.php phpunit
```

JavaScript unit tests are written with Jest and live in the `__tests__/`
directory. They exercise the front‑end utility functions and DOM helpers.
Install the Node dependencies and run them with:

```bash
npm install
npm test
```

Together the suites validate basic input handling for the API as well as
core front‑end behaviour.

## Calculators

Two small utilities help estimate watering needs:

- `calculator.php` &mdash; calculates daily water for a single pot using weather data.
- `bed_calculator.php` &mdash; computes irrigation for an entire garden bed.

Both rely on the coefficients defined in `config.php`.

Weather data retrieved from OpenWeather is cached for one hour to limit API
requests and speed up page loads. The calculators automatically use the cached
response if available.

## Basic Usage

Use the main interface at `index.html` to add plants, mark them as watered or
fertilized, and upload photos. The API endpoints under `api/` are used by the
front‑end JavaScript (`script.js`) to interact with the database.

In list or text view you can swipe right on a plant card to complete all due
tasks (watering and fertilizing) at once. The card slides with your finger
and smoothly snaps back if you don't pass the threshold.

You can also export your current plant list as JSON or CSV using the download
buttons at the top of the page.



## Service Worker

The app uses a simple service worker to cache core assets for offline access. During development you may need to update the cache when making changes. Bump the cache version in `service-worker.js` or run **Disable cache** in your browser's developer tools and reload to ensure the latest files are served.
