<?php
if (!headers_sent()) {
    header('Content-Type: application/json');
}
$configFile = __DIR__ . '/../config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Config file missing']);
    return;
}
$config = include $configFile;
$key = $config['openweather_key'] ?? null;
if (!$key) {
    http_response_code(500);
    echo json_encode(['error' => 'API key not set']);
    return;
}
http_response_code(200);
echo json_encode(['key' => $key]);
?>
