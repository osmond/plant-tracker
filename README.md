# Plant Tracker

Plant Tracker is a small PHP web app that helps you keep your houseplants healthy. It stores each plant in a MySQL database and lets you tick off watering and fertilizing tasks right in your browser. A couple of tiny calculators use local weather data to estimate how much water your plants need.

<details>
<summary>Technical TL;DR</summary>

- API endpoints live under `api/` and communicate with MySQL using the `mysqli` extension (see `db.example.php`).
- OpenWeather data is cached by `weather_cache.php` for one hour.
- Images you upload are stored in `uploads/` with their paths saved in the database.
- Unit tests reside in `tests/` for PHP and `__tests__/` for JavaScript.
- Helper scripts such as the migration runner are in `scripts/`.
- A simple service worker provides offline support and pre-caches key files.

</details>

*Overview of the main interface listing plants and upcoming tasks.*

## Prerequisites
- [PHP](https://www.php.net/manual/en/install.php)
- [MySQL](https://dev.mysql.com/doc/refman/8.0/en/installing.html)
- [Node.js](https://nodejs.org/en/download/)

## Setup
1. Clone this repository.
2. Copy `config.example.php` to `config.php` and edit the settings, including your OpenWeather API key:

```php
'openweather_key' => 'YOUR_API_KEY',
'location'        => 'City,Country',
'auth_password'   => 'plants123',
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
The `auth_password` value sets the password for the login overlay on `index.html`. Change it in your `config.php` if you want a different credential.

   Extraterrestrial radiation (RA) is calculated automatically from the
   latitude returned by OpenWeather and the current day of year, so no
   configuration value is required.

   The OpenWeather API key and location are required for the water calculators.
   The client now calls `api/weather.php`, which proxies requests to
   OpenWeather so the key is never exposed in the browser.
3. Copy `db.example.php` to `db.php` and add your MySQL credentials.
4. Run the database migrations:

```bash
php scripts/run_migrations.php
```

5. Start the PHP development server and open the app:

```bash
php -S localhost:8000
```

   Then visit `http://localhost:8000/index.html` in your browser.
   To jump directly to a particular plant when the page loads, append
   `#plant-{id}` to the URL, for example `http://localhost:8000/index.html#plant-5`.
   **Note:** Opening `index.html` directly as a file won't work because the JavaScript needs the PHP API endpoints.

## Deployment
Deploying the app to a server running PHP is straightforward:

1. Copy this repository to your host, either by cloning it with `git` or uploading the files via FTP.
2. On the server, create `config.php` and `db.php` from their respective `*.example.php` templates and adjust the settings.
3. Run `php scripts/run_migrations.php` to initialize the database.
4. Ensure the `uploads/` directory is writable by the web server so image uploads work.

## Project Structure
- `api/` holds the PHP endpoints used by the front end.
- `uploads/` stores images you attach to plants.
- `scripts/` contains helper scripts such as the migration runner.

## Running Tests
PHPUnit exercises the API code. Make sure the `phpunit` command is
available—either by installing it globally with Composer,

```bash
composer global require phpunit/phpunit
```

or by downloading the
[PHPUnit PHAR](https://phpunit.de/getting-started/phpunit-9.html) and running it
with `php phpunit.phar`. Once installed, run the suite from the project root:

```bash
phpunit
```

It loads a stub database config from `tests/db_stub.php` unless you override
`DB_CONFIG`.

The JavaScript helpers use Jest. Install the Node packages first:

```bash
npm install
```

Make sure you have a Node version that supports ES modules (Node 14+ is recommended).

then run:

```bash
npm test
```

## Building CSS
The project uses Tailwind CSS for styling. If you modify `tailwind.config.js` or
update HTML templates, regenerate the stylesheet with:

```bash
npm run build:css
```
This command outputs `css/tailwind.css`.

## Calculators
Two small utilities help estimate watering needs:

- `calculator.php` &mdash; calculates daily water for a single pot using weather data.
- `bed_calculator.php` &mdash; computes irrigation for an entire garden bed.

Both rely on the coefficients defined in `config.php`.

Weather data retrieved from OpenWeather is cached for one hour to limit API requests and speed up page loads. The calculators automatically use the cached response if available.

## How the Watering Calculator Works

### Temperature input
We pull today’s minimum and maximum air temperatures (°C) from OpenWeatherMap and compute the average:

```
Tavg = (Tmin + Tmax) / 2
```

### Reference evapotranspiration (ET₀)
We apply the Hargreaves equation:

```
ET0 = 0.0023 × (Tavg + 17.8) × √(Tmax – Tmin) × Ra
```

with Ra (extraterrestrial radiation) defaulting to 20 MJ·m⁻²·day⁻¹ when no latitude is available. This fallback value is defined directly in the code.

### Crop adjustment (ETc)
Multiply ET₀ by the plant’s crop coefficient (Kc) from your `kc_map` (e.g. 0.3 for succulents, 0.8 for houseplants) to get ETc:

```
ETc = Kc × ET0
```

### Volume conversion
Convert depth (mm) to volume (mL) using the pot’s surface area:

```
area_cm2 = π × (diameter_cm / 2)²
water_mL = ETc × area_cm2 × 0.1
```

Finally, we convert to U.S. fluid ounces (1 oz = 29.5735 mL) and round to one decimal.

### References
- FAO-56 “Crop Evapotranspiration” (Allen et al., 1998)
- Hargreaves & Samani (1985)
- `script.js` (`calculateET0` function)
- `calculator.php` and `js/calc.js` (default Ra fallback)
- `config.php` (default Kc values)

## Basic Usage
Use the main interface at `index.html` to add plants, mark them as watered or fertilized, and upload photos. The API endpoints under `api/` are used by the front‑end JavaScript (`script.js`) to interact with the database.

In list or text view you can swipe right on a plant card to complete all due tasks (watering and fertilizing) at once. The card slides with your finger and smoothly snaps back if you don't pass the threshold.

You can also export your current plant list as JSON or CSV using the download buttons at the top of the page.
Plants you no longer want on the main list can be archived. Click the **Archived** button in the toolbar to view or restore archived plants.

The **Analytics** link now opens the analytics page in a new tab with charts of historical ET₀ and water use.

The plant form offers live suggestions for scientific names as you type a common
plant name. Selecting a scientific name fills the field and loads a thumbnail
preview fetched from the
[iNaturalist](https://api.inaturalist.org) API. Thumbnails now use the API's
`medium_url` variant (~368×500 pixels) so they remain sharp when displayed.
The previous OpenFarm integration was removed because that service is no longer
available. Ensure outbound access to `api.inaturalist.org` is allowed or the
suggestions and images won't appear.

Below the **Water Amount** field you'll now see an **Auto-calculated** line
showing the recommended volume in ounces and milliliters. This value updates
whenever you change the pot diameter, pick a different plant type, or when new
weather data is retrieved. The `Override auto-calculate` checkbox reveals the
water amount input so you can enter your own value. When editing a plant that
already has a custom amount saved, the box starts checked and your value is
preserved until you clear it.

### Filtering Plants
The toolbar includes a **Filters** button on smaller screens. Clicking it reveals
dropdowns for narrowing the list. You can filter by **room**, show plants that
need specific **care** (watering or fertilizing), and change the **sort** order.
Selections apply instantly and the panel hides after you choose an option.
You can select multiple rooms by holding Ctrl/Cmd or Shift while clicking.

The search box in the toolbar now stays visible while you scroll so you can
quickly look up plants at any time.

## Service Worker
A small service worker caches the key pages and scripts so the app still opens when you're offline. During development you may need to disable the cache or bump the version in `service-worker.js` to pick up changes.



