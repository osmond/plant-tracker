<?php
$host = getenv('DB_HOST') ?: 'localhost';
$user = getenv('DB_USER') ?: 'u568785491_jon';
$pass = getenv('DB_PASS') ?: 'yS+olgrwgD1';
$dbname = getenv('DB_NAME') ?: 'u568785491_plants';

$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig; // overrides $host, $user, $pass, $dbname if defined
}

$conn = null;
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
try {
    $conn = new mysqli($host, $user, $pass, $dbname);
    $conn->set_charset('utf8mb4');
} catch (mysqli_sql_exception $e) {
    error_log('Database connection failed: ' . $e->getMessage());
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    @http_response_code(500);
    $response = ['error' => 'Database connection failed'];
    if (getenv('DEBUG')) {
        $response['details'] = $e->getMessage();
    }
    echo json_encode($response);
    if (!getenv('TESTING')) {
        exit;
    }
}
?>

