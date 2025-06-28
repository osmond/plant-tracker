# Plant Tracker

**Plant-Tracker: Your automatic watering & fertilizing scheduler for every pot, powered by live weather data.**

![PHP Version](https://img.shields.io/badge/PHP-7.4%2B-blue)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen)

Plant Tracker is a lightweight PHP and JavaScript app that keeps all of your plants in one place and helps you care for them at the right time. It fetches local weather conditions to fine‑tune watering reminders so your collection thrives.

## Screenshot
[![Screenshot of Plant Tracker](https://github.com/osmond/plant-tracker/blob/main/screenshot.png?raw=true)](index.html)

## Table of Contents
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [Usage](#usage)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

## Quickstart

```bash
# Clone the repo
git clone https://github.com/osmond/plant-tracker.git
cd plant-tracker

# Copy the sample config and add your OpenWeather key
cp config.example.php config.php

# Run the database migrations
mysql -u <user> -p <db> < migrations/001_add_water_amount.sql
mysql -u <user> -p <db> < migrations/002_add_water_amount.sql
mysql -u <user> -p <db> < migrations/003_add_plant_type.sql

# Start a local server
php -S localhost:8000
```
Open `http://localhost:8000/index.html` in your browser to begin.

## Configuration

Edit `config.php` and provide:

- `openweather_key` – your OpenWeather API key
- `location` – city name used for weather lookups
- `ra`, `kc` and mapping values for water calculations
- `kc_map` defines coefficients for each `plant_type`

The app fetches rainfall using OpenWeather's **forecast** endpoint.

Database credentials are taken from the environment variables `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME`.

## Usage

1. Click **Add Plant** to create a new entry.
2. Choose a plant type, upload a photo and fill out the care schedule.
3. Type a plant name to automatically fetch matching scientific names from the GBIF Species API.
4. Selecting a suggestion shows its classification, common names and synonyms beneath the field.
5. If available, specimen photos from GBIF appear as thumbnails for quick reference.
6. View upcoming tasks in the calendar and drag them to reschedule.

Uploaded images are stored in `uploads/` and automatically converted to WebP when possible.

## Water Calculators

Two optional calculators help estimate daily watering needs based on local weather.

- **Plant Water Calculator** (`calculator.php`) – Enter a pot diameter and choose a plant type. The tool fetches the day's minimum and maximum temperature from OpenWeather and applies the Hargreaves equation to compute reference evapotranspiration. This value is multiplied by the crop coefficient (`kc` or the value from `kc_map`) and the pot surface area to output an approximate mL/day requirement.
- **Garden Bed Calculator** (`bed_calculator.php`) – For beds, supply soil parameters like field capacity and root depth. It uses FAO56 single crop coefficient formulas with soil evaporation terms to estimate irrigation in liters needed for the entire bed.

Both calculators read settings from `config.php`, including your `openweather_key`, location and plant coefficients.

## FAQ

**Where do I get my API key?** Sign up for a free account at [OpenWeather](https://openweathermap.org/api) and copy your key into `config.php`.

**Do I need a database?** The app requires MySQL or MariaDB for storing plant data. The test suite uses a stub database so you can run the tests without one.

## Contributing

Pull requests are welcome! Feel free to open an [issue](https://github.com/osmond/plant-tracker/issues) or start a [discussion](https://github.com/osmond/plant-tracker/discussions) if you have ideas.

## Roadmap

- 🌱 Mobile-friendly layout
- 📊 Stats dashboard
- 🔔 Push notification reminders

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
