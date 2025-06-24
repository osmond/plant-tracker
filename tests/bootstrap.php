<?php
// Bootstrap for tests

// Point the application to the stub database configuration used by the test
// suite. Each API script checks the DB_CONFIG environment variable and includes
// that file if it exists.
putenv('DB_CONFIG=' . __DIR__ . '/db_stub.php');

// Enable a TESTING flag so scripts can adjust behavior if needed.
putenv('TESTING=1');
