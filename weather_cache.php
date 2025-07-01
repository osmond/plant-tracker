<?php
/**
 * Fetch weather data with simple file-based caching.
 *
 * @param array $config Configuration with 'openweather_key' and 'location'
 * @param string|null $cacheFile Optional cache file path
 * @param int $ttl Cache time-to-live in seconds
 * @return array Weather data or ['error' => string]
 */
function fetchWeatherCached(array $config, ?string $cacheFile = null, int $ttl = 3600): array {
    if ($cacheFile === null) {
        $cacheFile = sys_get_temp_dir() . '/weather_cache.json';
    }

    if (is_readable($cacheFile)) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if (isset($cached['timestamp'], $cached['data']) && (time() - $cached['timestamp']) < $ttl) {
            return $cached['data'];
        }
    }

    $url = 'https://api.openweathermap.org/data/2.5/weather?q=' . urlencode($config['location']) . '&appid=' . $config['openweather_key'];
    $json = @file_get_contents($url);
    if ($json === false) {
        return ['error' => 'Unable to contact weather service.'];
    }

    $data = json_decode($json, true);
    if (!is_array($data)) {
        return ['error' => 'Invalid response from weather service.'];
    }

    $payload = ['timestamp' => time(), 'data' => $data];
    @file_put_contents($cacheFile, json_encode($payload));

    return $data;
}
