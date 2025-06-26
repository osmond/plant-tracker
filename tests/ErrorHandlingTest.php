<?php
use PHPUnit\Framework\TestCase;

class ErrorHandlingTest extends TestCase
{
    private $dbConfig;

    protected function setUp(): void
    {
        $this->dbConfig = __DIR__ . '/db_stub_fail.php';
        putenv('DB_CONFIG=' . $this->dbConfig);
        putenv('TESTING=1');
        putenv('DEBUG'); // ensure DEBUG is unset
    }

    public function testDatabaseErrorHidesDetailsWhenDebugDisabled()
    {
        $_POST = [
            'name' => 'Fail Plant',
            'watering_frequency' => 5,
            'water_amount' => 100
        ];
        ob_start();
        include __DIR__ . '/../api/add_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertEquals('Database error', $data['error']);
        $this->assertArrayNotHasKey('details', $data);
    }
}
?>
