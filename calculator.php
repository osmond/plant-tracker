<?php
/* Simple Plant Water Calculator */
// Load configuration values


$config = require __DIR__ . '/config.php';
require_once __DIR__ . '/weather_cache.php';

/**
 * Calculate reference evapotranspiration using the Hargreaves equation.
 */
function calculateET0(float $tmin, float $tmax, float $ra): float {
    $tavg = ($tmin + $tmax) / 2;
    return 0.0023 * ($tavg + 17.8) * sqrt(max(0, $tmax - $tmin)) * $ra;
}

/**
 * Compute extraterrestrial radiation for a given latitude and day of year.
 */
function computeRA(float $lat, int $doy): float {
    $gsc = 0.0820; // MJ m^-2 min^-1
    $latRad = deg2rad($lat);
    $dr = 1 + 0.033 * cos((2 * M_PI / 365) * $doy);
    $dec = 0.409 * sin((2 * M_PI / 365) * $doy - 1.39);
    $ws = acos(-tan($latRad) * tan($dec));
    return (24 * 60 / M_PI) * $gsc * $dr *
        ($ws * sin($latRad) * sin($dec) + cos($latRad) * cos($dec) * sin($ws));
}

/**
 * Compute the surface area of the pot in square centimeters.
 */
function computeArea(float $diameter_cm): float {
    $r = $diameter_cm / 2;
    return pi() * $r * $r;
}

$diam = null;
$plant_type = null;
$water_ml = null;
$error = null;

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_POST['pot_diameter_cm']) || !is_numeric($_POST['pot_diameter_cm']) || floatval($_POST['pot_diameter_cm']) <= 0) {
        $error = 'Please provide a valid pot diameter.';
    } else {
        $diam = floatval($_POST['pot_diameter_cm']);
        $plant_type = isset($_POST['plant_type']) ? strval($_POST['plant_type']) : null;
        $weather = fetchWeatherCached($config);
        if (isset($weather['error'])) {
            $error = $weather['error'];
        } elseif (!isset($weather['main']['temp_min'], $weather['main']['temp_max'])) {
            $error = 'Weather data incomplete.';
        } else {
            // Convert temperatures from Kelvin to Celsius
            $tmin = $weather['main']['temp_min'] - 273.15;
            $tmax = $weather['main']['temp_max'] - 273.15;

            // Calculate RA for this latitude/day then ET0
            $lat = $weather['coord']['lat'] ?? null;
            $doy = intval(date('z')) + 1;
            $ra = $lat !== null ? computeRA(floatval($lat), $doy) : ($config['ra'] ?? 20.0);
            $et0 = calculateET0($tmin, $tmax, $ra);
            $kc = $config['kc'];
            if ($plant_type !== null && isset($config['kc_map'][$plant_type])) {
                $kc = $config['kc_map'][$plant_type];
            }
            $etc = $kc * $et0;
            
            // Determine pot surface area and convert ET to mL/day
            $area = computeArea($diam);
            $water_ml = $etc * $area * 0.1; // 1 mm over 1 cm^2 is 0.1 mL
        }
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Plant Water Calculator</title>
</head>
<body>
    <h1>Plant Water Calculator</h1>
    <?php if ($error): ?>
        <p style="color:red;">
            <?php echo htmlspecialchars($error); ?>
        </p>
    <?php endif; ?>

    <!-- Input form for pot diameter and plant type -->
    <form method="post">
        <label for="pot_diameter_cm">Pot diameter (cm):</label>
        <input type="number" step="0.1" name="pot_diameter_cm" id="pot_diameter_cm" required value="<?php echo $diam !== null ? htmlspecialchars($diam) : ''; ?>">

        <label for="plant_type">Plant type:</label>
        <select name="plant_type" id="plant_type">
            <?php foreach ($config['kc_map'] as $type => $val): ?>
                <option value="<?php echo htmlspecialchars($type); ?>" <?php if ($plant_type === $type || ($plant_type === null && $type === 'houseplant')) echo 'selected'; ?>><?php echo htmlspecialchars(ucfirst($type)); ?></option>
            <?php endforeach; ?>
        </select>

        <button type="submit">Calculate Water Need</button>
    </form>

    <!-- Display result if available -->
    <?php if ($water_ml !== null): ?>
        <p>Daily watering for New Brighton, MN (pot Ø <?php echo htmlspecialchars($diam); ?> cm):
           <strong><?php echo round($water_ml); ?> mL</strong></p>
    <?php endif; ?>
</body>
</html>
