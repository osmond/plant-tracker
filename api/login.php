<?php
if (PHP_SAPI !== 'cli' && session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
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
$expected = $config['auth_password'] ?? 'plants123';
$input = json_decode(file_get_contents('php://input'), true);
$pw = $input['password'] ?? ($_POST['password'] ?? '');
if ($pw === $expected) {
    $_SESSION['logged_in'] = true;
    echo json_encode(['success' => true]);
} else {
    if (PHP_SAPI !== 'cli') {
        http_response_code(401);
    }
    echo json_encode(['error' => 'Invalid credentials']);
}
?>
