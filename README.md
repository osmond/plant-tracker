# Plant Tracker

Plant Tracker is a small web app for managing your houseplants. It runs on PHP with a MySQL database and uses vanilla JavaScript in the browser. Weather data from OpenWeather helps estimate how much to water each plant. Node.js is only needed for running the front-end tests.

![Screenshot of Plant Tracker](screenshot.png)

## Quick Start

1. Install PHP, MySQL and Node.js.
2. Clone the repository.
3. Copy `config.example.php` to `config.php` and fill in your OpenWeather key and location.
4. Copy `db.example.php` to `db.php` and enter your database credentials.
5. Create a MySQL database and run the migrations:
   ```bash
   php scripts/run_migrations.php
   ```
6. Install the Node dependencies:
   ```bash
   npm install
   ```
7. Start the development server and open the app:
   ```bash
   php -S localhost:8000
   ```
   Visit [http://localhost:8000/index.html](http://localhost:8000/index.html). **index.html must be loaded through this PHP server or the API calls will fail.**

## Running Tests

Two small test suites come with the project. Run the PHP API tests with:

```bash
phpunit
```

The front-end utilities are tested with Jest. Run those with:

```bash
npm test
```

## Calculators

Two utilities estimate watering needs:

- `calculator.php` – calculates daily water for a single pot using weather data.
- `bed_calculator.php` – computes irrigation for a whole garden bed.

Both rely on the coefficients defined in `config.php` and use cached OpenWeather responses.

## Basic Usage

Use the main interface at `index.html` to add plants, mark them as watered or fertilized and upload photos. The API endpoints under `api/` are called by `script.js`.

In list or text view you can swipe right on a plant card to complete all due tasks at once. Cards slide with your finger and snap back if you don't pass the threshold.

You can also export your current plant list as JSON or CSV using the download buttons at the top of the page.

## Service Worker

The app uses a simple service worker to cache core assets for offline access. During development you may need to update the cache when making changes. Bump the cache version in `service-worker.js` or clear your browser cache to ensure the latest files are served.
