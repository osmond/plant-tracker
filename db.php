<?php
$host = "localhost"; // Leave this as is
$user = "u568785491_jon"; // Your actual DB user
$pass = "yS+olgrwgD1";  // ✅ Your new password
$dbname = "u568785491_plants"; // Your actual DB name

$conn = new mysqli($host, $user, $pass, $dbname);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>