<?php
$config = require __DIR__ . '/config.php';

function fetchWeather($config) {
    $url = 'https://api.openweathermap.org/data/2.5/weather?q=' . urlencode($config['location']) . '&appid=' . $config['openweather_key'];

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 10
        ]
    ]);
    $json = @file_get_contents($url, false, $ctx);
    if ($json === false) {
        throw new RuntimeException('Failed to fetch weather data.');
    }
    $data = json_decode($json, true);
    if ($data === null) {
        throw new RuntimeException('Failed to decode weather data.');
    }
    return $data;
}

try {
    $data = fetchWeather($config);
    $tmin = $data['main']['temp_min'] - 273.15;
    $tmax = $data['main']['temp_max'] - 273.15;
    $tavg = ($tmin + $tmax) / 2;

    $et0 = 0.0023 * ($tavg + 17.8) * sqrt(max(0, $tmax - $tmin)) * $config['ra'];
    $etc = $config['kc'] * $et0;

    $r = $config['pot_diameter_cm'] / 2;
    $area = pi() * $r * $r;

    $water_ml = $etc * $area * 0.1;

    echo "Daily watering for {$config['location']}: " . round($water_ml) . " mL\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
?>
