# Plant Tracker

Plant Tracker is a lightweight PHP application for managing your houseplants. It stores
plant records in a MySQL database and provides a simple web interface to track
watering and fertilizing. The project also includes small calculators for estimating
water requirements using local weather data.

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
3. Configure your MySQL connection in `db.php` or using environment variables in
   the testing stubs located under `tests/`.
4. Start a local server from the project root:

```bash
php -S localhost:8000
```

   Then open `http://localhost:8000/index.html` in your browser.

## Running Tests

PHPUnit tests are provided for the API endpoints. Run them from the project root:

```bash
phpunit
```

The suite validates basic input handling and error cases for the API.

## Calculators

Two small utilities help estimate watering needs:

- `calculator.php` &mdash; calculates daily water for a single pot using weather data.
- `bed_calculator.php` &mdash; computes irrigation for an entire garden bed.

Both rely on the coefficients defined in `config.php`.

## Basic Usage

Use the main interface at `index.html` to add plants, mark them as watered or
fertilized, and upload photos. The API endpoints under `api/` are used by the
front‑end JavaScript (`script.js`) to interact with the database.


