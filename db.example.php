<?php
$host = "localhost"; // Database host
$user = "DB_USER";    // Your database username
$pass = "DB_PASS";    // Your database password
$dbname = "DB_NAME";  // Your database name

$dbConfig = getenv('DB_CONFIG');
if ($dbConfig && file_exists($dbConfig)) {
    include $dbConfig; // overrides $host, $user, $pass, $dbname if defined
}

$conn = new mysqli($host, $user, $pass, $dbname);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>
