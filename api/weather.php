<?php
if (!headers_sent()) {
    header('Content-Type: application/json');
}
$configFile = __DIR__ . '/../config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Config file missing']);
    exit;
}
$config = include $configFile;
$key = $config['openweather_key'] ?? null;
if (!$key) {
    http_response_code(500);
    echo json_encode(['error' => 'API key not set']);
    exit;
}
$lat = $_GET['lat'] ?? null;
$lon = $_GET['lon'] ?? null;
if ($lat === null || $lon === null) {
    http_response_code(400);
    echo json_encode(['error' => 'lat and lon required']);
    exit;
}
$base = 'https://api.openweathermap.org/data/2.5/';
$weatherUrl = $base . 'weather?lat=' . urlencode($lat) . '&lon=' . urlencode($lon) .
    '&units=imperial&appid=' . $key;
$forecastUrl = $base . 'forecast?lat=' . urlencode($lat) . '&lon=' . urlencode($lon) .
    '&appid=' . $key;
$weatherJson = @file_get_contents($weatherUrl);
$forecastJson = @file_get_contents($forecastUrl);
if ($weatherJson === false || $forecastJson === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Weather service unavailable']);
    exit;
}
$weatherData = json_decode($weatherJson, true);
$forecastData = json_decode($forecastJson, true);
if (!is_array($weatherData) || !is_array($forecastData)) {
    http_response_code(502);
    echo json_encode(['error' => 'Invalid weather response']);
    exit;
}
$rain = [0, 0, 0];
if (isset($forecastData['list']) && is_array($forecastData['list'])) {
    $now = time();
    foreach ($forecastData['list'] as $entry) {
        if (!isset($entry['dt'])) continue;
        $diff = floor(($entry['dt'] - $now) / 86400);
        if ($diff >= 0 && $diff < 3) {
            $amount = $entry['rain']['3h'] ?? 0;
            $rain[$diff] += $amount / 25.4;
        }
    }
}
$result = [
    'temp' => $weatherData['main']['temp'] ?? null,
    'temp_min' => $weatherData['main']['temp_min'] ?? null,
    'temp_max' => $weatherData['main']['temp_max'] ?? null,
    'desc' => $weatherData['weather'][0]['main'] ?? '',
    'icon' => $weatherData['weather'][0]['icon'] ?? '',
    'rain' => $rain
];
http_response_code(200);
echo json_encode($result);
?>
