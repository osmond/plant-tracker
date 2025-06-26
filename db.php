<?php
$host = "localhost"; // Leave this as isAdd commentMore actions
$user = "u568785491_jon"; // Your actual DB user
$pass = "yS+olgrwgD1";  // ✅ Your new password
$dbname = "u568785491_plants"; // Your actual DB name

$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig; // overrides $host, $user, $pass, $dbname if defined
}

$conn = new mysqli($host, $user, $pass, $dbname);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>

