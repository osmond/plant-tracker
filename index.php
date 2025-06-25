<?php
$config = require __DIR__ . '/config.php';
function fetchWeather(array $config): array {
    $url = 'https://api.openweathermap.org/data/2.5/weather?q=' . urlencode($config['location']) . '&appid=' . $config['openweather_key'];
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
function calculateET0(float $tmin, float $tmax, float $ra): float {
    $tavg = ($tmin + $tmax) / 2;
    return 0.0023 * ($tavg + 17.8) * sqrt(max(0, $tmax - $tmin)) * $ra;
}
function computeArea(float $diameter): float {
    $r = $diameter / 2;
    return pi() * $r * $r;
}
$result = null;
$error = '';
$diam = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pot_diameter_cm'])) {
    $diam = $_POST['pot_diameter_cm'];
    if (!is_numeric($diam) || $diam <= 0) {
        $error = 'Pot diameter must be a positive number.';
    } else {
        $diam = floatval($diam);
        $weather = fetchWeather($config);
        if (isset($weather['error'])) {
            $error = $weather['error'];
        } else {
            $data = $weather['data'];
            $tmin = $data['main']['temp_min'] - 273.15;
            $tmax = $data['main']['temp_max'] - 273.15;
            $et0 = calculateET0($tmin, $tmax, $config['ra']);
            $etc = $config['kc'] * $et0;
            $area = computeArea($diam);
            $water_ml = $etc * $area * 0.1;
            $result = round($water_ml);
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Plant Tracker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              bg: '#fdf9fd',
              card: '#ffffff',
              primary: '#8d67d6',
              accent: '#ffa5d8',
              text: '#333333'
            }
          }
        }
      }
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-bg text-text min-h-screen">
    <h1 class="app-title text-2xl font-bold p-4">

        My Plant Tracker
        <button id="show-add-form" class="bg-primary text-white rounded-md px-4 py-2 ml-auto"></button>
        <button id="toggle-search" class="bg-primary text-white rounded-md px-4 py-2 ml-2">Search</button>
    </h1>
    <div id="summary" class="p-4 bg-card rounded-lg mb-4">
        <!-- counts will go here -->
    </div>

    <div id="search-container" class="mb-4 hidden flex items-center gap-2">
        <label for="search-input" class="sr-only">Search Plants</label>
        <div class="relative flex-grow">
            <span class="absolute left-3 top-1/2 -translate-y-1/2">🔎</span>
            <input type="text" id="search-input" placeholder="Search by name or species" class="w-full pl-8 p-2 border rounded-md" />
        </div>
        <button id="close-search" type="button" class="bg-gray-200 rounded-md px-3 py-2"></button>
    </div>


    <form id="plant-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-card rounded-lg shadow hidden" enctype="multipart/form-data">
        <div>
            <label for="name" class="block mb-1">Plant Name</label>
            <input type="text" name="name" id="name" placeholder="Plant Name" class="w-full border rounded-md p-2" />
            <div class="error" id="name-error"></div>
        </div>
        <div>
            <label for="species" class="block mb-1">Species</label>
            <input type="text" name="species" id="species" placeholder="Species" class="w-full border rounded-md p-2" />
            <div class="error" id="species-error"></div>
        </div>
        <div>
            <label for="watering_frequency" class="block mb-1">Watering Frequency (days)</label>
            <input type="number" name="watering_frequency" id="watering_frequency" class="w-full border rounded-md p-2" />
            <div class="error" id="watering_frequency-error"></div>
        </div>
        <div>
            <label for="fertilizing_frequency" class="block mb-1">Fertilizing Frequency (days)</label>
            <input type="number" name="fertilizing_frequency" id="fertilizing_frequency" class="w-full border rounded-md p-2" />
        </div>
        <div>
            <label for="photo" class="block mb-1">Upload Photo</label>
            <input type="file" id="photo" name="photo" accept="image/*" class="w-full" />
        </div>
        <div>
            <label for="room" class="block mb-1">Room</label>
            <input type="text" name="room" id="room" placeholder="Room" class="w-full border rounded-md p-2" />
            <div class="error" id="room-error"></div>
        </div>
        <div>
            <label for="last_watered" class="block mb-1">Last Watered</label>
            <input type="date" name="last_watered" id="last_watered" class="w-full border rounded-md p-2" />
        </div>
        <div>
            <label for="last_fertilized" class="block mb-1">Last Fertilized</label>
            <input type="date" name="last_fertilized" id="last_fertilized" class="w-full border rounded-md p-2" />
        </div>
        <div class="sm:col-span-2 flex gap-2 justify-end">
            <button type="button" id="cancel-edit" class="bg-gray-200 rounded-md px-4 py-2 hidden"></button>
            <button type="submit" class="bg-primary text-white rounded-md px-4 py-2"></button>
        </div>
    </form>

    <div class="my-4 flex flex-wrap gap-2">
        <select id="room-filter" class="border p-2 rounded-md">
            <option value="all">All Rooms</option>
        </select>
        <select id="sort-toggle" class="border p-2 rounded-md">
            <option value="name">Sort by: Name</option>
            <option value="due">Sort by: Due Date</option>
        </select>
        <select id="due-filter" class="border p-2 rounded-md">
            <option value="all">Show: All</option>
            <option value="water">Needs Watering</option>
            <option value="fert">Needs Fertilizing</option>
            <option value="any">Needs Care</option>
        </select>
    </div>

    <!-- Undo delete snackbar -->
    <div id="undo-banner" class="mb-4">
        Plant deleted. <button id="undo-btn">Undo</button>
    </div>

    <div id="toast" class="toast"></div>

    <div id="plant-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 p-4"></div>

    <h3 class="text-xl font-semibold p-4">Upcoming Tasks</h3>
    <div id="calendar" class="p-4"></div>
<div id="water-calc" class="p-4">
    <h3 class="text-xl font-semibold mb-2">Water Calculator</h3>
    <form method="post">
        <label for="pot_diameter_cm">Pot diameter (cm):</label>
        <input type="number" step="0.1" name="pot_diameter_cm" id="pot_diameter_cm" required value="<?= htmlspecialchars($diam) ?>">
        <button type="submit">Calculate Water Need</button>
    </form>
<?php if ($result !== null): ?>
    <p>Daily watering for New Brighton, MN (pot Ø <?= htmlspecialchars($diam) ?> cm): <strong><?= $result ?> mL</strong></p>
<?php elseif ($error !== ''): ?>
    <p style="color:red;"><?= htmlspecialchars($error) ?></p>
<?php endif; ?>
</div>

    <script src="script.js"></script>
</body>
</html>
