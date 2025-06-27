# Plant Tracker

**Plant-Tracker: Your automatic watering & fertilizing scheduler for every pot, powered by live weather data.**

![PHP Version](https://img.shields.io/badge/PHP-7.4%2B-blue)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen)

Plant Tracker is a lightweight PHP and JavaScript app that keeps all of your plants in one place and helps you care for them at the right time. It fetches local weather conditions to fine‑tune watering reminders so your collection thrives.

## Table of Contents
- [Demo](#demo)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [Usage](#usage)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

## Demo
[![Screenshot of Plant Tracker](https://github.com/osmond/plant-tracker/blob/main/screenshot.png?raw=true)](index.html)
▶️ **[Live Demo](index.html)**

## Quickstart

```bash
# Clone the repo
git clone https://github.com/osmond/plant-tracker.git
cd plant-tracker

# Copy the sample config and add your OpenWeather key
cp config.example.php config.php

# Start a local server
php -S localhost:8000
```
Open `http://localhost:8000/index.html` in your browser to begin.

## Configuration

Edit `config.php` and provide:

- `openweather_key` – your OpenWeather API key
- `location` – city name used for weather lookups
- `ra`, `kc` and mapping values for water calculations

Database credentials are taken from the environment variables `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME`.

## Usage

1. Click **Add Plant** to create a new entry.
2. Upload a photo and fill out the care schedule.
3. View upcoming tasks in the calendar and drag them to reschedule.

Uploaded images are stored in `uploads/` and automatically converted to WebP when possible.

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
