<?php
/* Garden Bed Water Calculator */
$config = require __DIR__ . '/config.php';

function fetchWeather(array $config): array {
    $url = 'https://api.openweathermap.org/data/2.5/weather?q=' . urlencode($config['location']) . '&appid=' . $config['openweather_key'];
    $json = @file_get_contents($url);
    if ($json === false) {
        return ['error' => 'Unable to contact weather service.'];
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        return ['error' => 'Invalid response from weather service.'];
    }
    return $data;
}

function calculateET0(float $tmin, float $tmax, float $ra): float {
    $tavg = ($tmin + $tmax) / 2;
    return 0.0023 * ($tavg + 17.8) * sqrt(max(0, $tmax - $tmin)) * $ra;
}

$area = $plant_type = $stage = null;
$zroot = $fc = $wp = $p = $s_prev = $kr = $rain = null;
$irrigation_l = null;
$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $required = ['bed_area_m2','plant_type','growth_stage','root_depth_cm','fc','wp','p','s_prev_mm','kr','rain_mm'];
    foreach ($required as $field) {
        if (!isset($_POST[$field]) || $_POST[$field] === '') {
            $error = 'All fields are required.';
            break;
        }
    }
    if ($error === null) {
        $area = floatval($_POST['bed_area_m2']);
        $plant_type = strval($_POST['plant_type']);
        $stage = strval($_POST['growth_stage']);
        $zroot = floatval($_POST['root_depth_cm']);
        $fc = floatval($_POST['fc']);
        $wp = floatval($_POST['wp']);
        $p = floatval($_POST['p']);
        $s_prev = floatval($_POST['s_prev_mm']);
        $kr = floatval($_POST['kr']);
        $rain = floatval($_POST['rain_mm']);

        $weather = fetchWeather($config);
        if (isset($weather['error'])) {
            $error = $weather['error'];
        } elseif (!isset($weather['main']['temp_min'], $weather['main']['temp_max'])) {
            $error = 'Weather data incomplete.';
        } elseif (!isset($config['bed_map'][$plant_type]['kcb'][$stage], $config['bed_map'][$plant_type]['kc_soil'])) {
            $error = 'Invalid plant type or stage.';
        } else {
            $tmin = $weather['main']['temp_min'] - 273.15;
            $tmax = $weather['main']['temp_max'] - 273.15;
            $et0 = calculateET0($tmin, $tmax, $config['ra']);

            $kcb = $config['bed_map'][$plant_type]['kcb'][$stage];
            $kc_soil = $config['bed_map'][$plant_type]['kc_soil'];
            $ke = $kr * ($et0 * ($kc_soil - $kcb));
            $etc = ($kcb * $et0) + $ke;

            $zroot_m = $zroot / 100.0;
            $fc_storage = $fc * $zroot_m * 1000.0; // mm
            $dr = ($fc - $wp) * $zroot_m * $p * 1000.0;
            $s_n = min($fc_storage, $s_prev + $rain - $etc);
            $needed_mm = max(0.0, ($fc_storage - $dr) - $s_n);
            $irrigation_l = $needed_mm * $area; // 1 mm over 1 m^2 = 1 L
        }
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Garden Bed Water Calculator</title>
</head>
<body>
<h1>Garden Bed Water Calculator</h1>
<?php if ($error): ?>
<p style="color:red;"><?php echo htmlspecialchars($error); ?></p>
<?php endif; ?>
<form method="post">
    <label for="bed_area_m2">Bed area (m²):</label>
    <input type="number" step="0.1" name="bed_area_m2" id="bed_area_m2" required value="<?php echo $area !== null ? htmlspecialchars($area) : ''; ?>">

    <label for="plant_type">Plant type:</label>
    <select name="plant_type" id="plant_type">
        <?php foreach ($config['bed_map'] as $type => $vals): ?>
            <option value="<?php echo htmlspecialchars($type); ?>" <?php if ($plant_type === $type) echo 'selected'; ?>><?php echo htmlspecialchars(ucfirst($type)); ?></option>
        <?php endforeach; ?>
    </select>

    <label for="growth_stage">Growth stage:</label>
    <select name="growth_stage" id="growth_stage">
        <?php foreach (['ini' => 'Initial','mid' => 'Mid','end' => 'End'] as $key => $label): ?>
            <option value="<?php echo $key; ?>" <?php if ($stage === $key) echo 'selected'; ?>><?php echo $label; ?></option>
        <?php endforeach; ?>
    </select>

    <label for="root_depth_cm">Root depth (cm):</label>
    <input type="number" step="0.1" name="root_depth_cm" id="root_depth_cm" required value="<?php echo $zroot !== null ? htmlspecialchars($zroot) : ''; ?>">

    <label for="fc">Field capacity (fraction):</label>
    <input type="number" step="0.01" name="fc" id="fc" required value="<?php echo $fc !== null ? htmlspecialchars($fc) : ''; ?>">

    <label for="wp">Wilting point (fraction):</label>
    <input type="number" step="0.01" name="wp" id="wp" required value="<?php echo $wp !== null ? htmlspecialchars($wp) : ''; ?>">

    <label for="p">Allowable depletion fraction (p):</label>
    <input type="number" step="0.01" name="p" id="p" required value="<?php echo $p !== null ? htmlspecialchars($p) : ''; ?>">

    <label for="s_prev_mm">Previous soil storage Sₙ₋₁ (mm):</label>
    <input type="number" step="0.1" name="s_prev_mm" id="s_prev_mm" required value="<?php echo $s_prev !== null ? htmlspecialchars($s_prev) : ''; ?>">

    <label for="kr">Kr factor (0-1):</label>
    <input type="number" step="0.01" name="kr" id="kr" required value="<?php echo $kr !== null ? htmlspecialchars($kr) : ''; ?>">

    <label for="rain_mm">Rainfall since last check (mm):</label>
    <input type="number" step="0.1" name="rain_mm" id="rain_mm" required value="<?php echo $rain !== null ? htmlspecialchars($rain) : ''; ?>">

    <button type="submit">Calculate Irrigation Need</button>
</form>
<?php if ($irrigation_l !== null): ?>
    <p>Irrigation required today: <strong><?php echo round($irrigation_l, 2); ?> liters</strong></p>
<?php endif; ?>
</body>
</html>
