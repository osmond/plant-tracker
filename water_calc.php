<?php
// Load configuration settings
$config = require __DIR__ . '/config.php';

// Fetch current weather data from OpenWeatherMap
function fetchWeather(array $config): array
{
    $url = 'https://api.openweathermap.org/data/2.5/weather?q=' .
        urlencode($config['location']) . '&appid=' . $config['openweather_key'];

    $json = @file_get_contents($url);
    if ($json === false) {
        return ['error' => 'Unable to retrieve weather data'];
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        return ['error' => 'Invalid weather response'];
    }
    return ['data' => $data];
}

// Calculate reference evapotranspiration using the Hargreaves equation
function calculateET0(float $tmin, float $tmax, float $ra): float
{
    $tavg = ($tmin + $tmax) / 2;
    return 0.0023 * ($tavg + 17.8) * sqrt(max(0, $tmax - $tmin)) * $ra;
}

// Compute circular surface area in square centimeters
function computeArea(float $diameter): float
{
    $r = $diameter / 2;
    return pi() * $r * $r;
}

$result = null;
$error = '';
$diam = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $diam = $_POST['pot_diameter_cm'] ?? '';
    if (!is_numeric($diam) || $diam <= 0) {
        $error = 'Pot diameter must be a positive number.';
    } else {
        $diam = floatval($diam);
        $weather = fetchWeather($config);
        if (isset($weather['error'])) {
            $error = $weather['error'];
        } else {
            $data = $weather['data'];
            $tmin = $data['main']['temp_min'] - 273.15; // Convert Kelvin to Celsius
            $tmax = $data['main']['temp_max'] - 273.15;
            $et0 = calculateET0($tmin, $tmax, $config['ra']);
            $etc = $config['kc'] * $et0; // Apply crop coefficient
            $area = computeArea($diam);
            $water_ml = $etc * $area * 0.1; // 1 mm over 1 cm^2 = 0.1 mL
            $result = round($water_ml);
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plant Water Calculator</title>
</head>
<body>
    <form method="post">
        <label for="pot_diameter_cm">Pot diameter (cm):</label>
        <input type="number" step="0.1" name="pot_diameter_cm" id="pot_diameter_cm" required value="<?= htmlspecialchars($diam) ?>">
        <button type="submit">Calculate Water Need</button>
    </form>
<?php if ($result !== null): ?>
    <p>Daily watering for New Brighton, MN (pot Ø <?= htmlspecialchars($diam) ?> cm):
        <strong><?= $result ?> mL</strong></p>
<?php elseif ($error !== ''): ?>
    <p style="color:red;"><?= htmlspecialchars($error) ?></p>
<?php endif; ?>
</body>
</html>
<?php
?>
