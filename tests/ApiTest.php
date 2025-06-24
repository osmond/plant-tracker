<?php
use PHPUnit\Framework\TestCase;

class ApiTest extends TestCase
{
    private $dbConfig;
    protected function setUp(): void
    {
        // Ensure the environment variables set in bootstrap remain consistent
        // for each individual test case.
        $this->dbConfig = __DIR__ . '/db_stub.php';
        putenv('DB_CONFIG=' . $this->dbConfig);
        putenv('TESTING=1');
    }

    public function testAddPlantMissingName()
    {
        $_POST = [];
        ob_start();
        include __DIR__ . '/../api/add_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertArrayHasKey('error', $data);
    }

    public function testDeletePlantMissingId()
    {
        $_POST = [];
        ob_start();
        include __DIR__ . '/../api/delete_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertFalse($data['success']);
        $this->assertArrayHasKey('error', $data);
    }

    public function testGetHistoryReturnsArray()
    {
        $_GET = [];
        $handler = set_error_handler(function ($errno, $errstr) {
            return str_contains($errstr, 'headers already sent');
        }, E_WARNING);
        ob_start();
        include __DIR__ . '/../api/get_history.php';
        $output = ob_get_clean();
        restore_error_handler();
        $data = json_decode($output, true);
        $this->assertIsArray($data);
    }

    public function testMarkWateredReturnsSuccess()
    {
        $_POST = ['id' => 1];
        $expected = (new DateTime())->format('Y-m-d');

        ob_start();
        include __DIR__ . '/../api/mark_watered.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);

        $this->assertEquals('success', $data['status']);
        $this->assertEquals($expected, $data['updated']);
    }

    public function testMarkFertilizedReturnsSuccess()
    {
        $_POST = ['id' => 2, 'snooze_days' => 3];
        $date = new DateTime();
        $date->modify('+3 days');
        $expected = $date->format('Y-m-d');

        ob_start();
        include __DIR__ . '/../api/mark_fertilized.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);

        $this->assertEquals('success', $data['status']);
        $this->assertEquals($expected, $data['updated']);
    }

    public function testGetHistoryStructure()
    {
        $_GET = [];
        $handler = set_error_handler(function ($errno, $errstr) {
            return str_contains($errstr, 'headers already sent');
        }, E_WARNING);
        ob_start();
        include __DIR__ . '/../api/get_history.php';
        $output = ob_get_clean();
        restore_error_handler();
        $data = json_decode($output, true);

        $this->assertArrayHasKey('mostWatered', $data);
        $this->assertArrayHasKey('averages', $data);
        $this->assertIsArray($data['mostWatered']);
        $this->assertIsArray($data['averages']);
    }
}
?>
