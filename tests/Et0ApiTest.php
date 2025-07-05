<?php
use PHPUnit\Framework\TestCase;

class Et0ApiTest extends TestCase
{
    private $dbConfig;

    protected function setUp(): void
    {
        $this->dbConfig = __DIR__ . '/db_stub.php';
        putenv('DB_CONFIG=' . $this->dbConfig);
        putenv('TESTING=1');
    }

    protected function tearDown(): void
    {
        if (isset($GLOBALS['mock_query_result'])) {
            unset($GLOBALS['mock_query_result']);
        }
    }

    public function testLogEt0InvalidParams()
    {
        $_POST = ['plant_id' => 0, 'et0_mm' => 1.2];
        ob_start();
        @include __DIR__ . '/../api/log_et0.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertArrayHasKey('error', $data);
    }

    public function testLogEt0ValidParams()
    {
        $_POST = ['plant_id' => 1, 'et0_mm' => 1.2, 'water_ml' => 30];
        ob_start();
        @include __DIR__ . '/../api/log_et0.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertEquals('ok', $data['status']);
    }

    public function testGetEt0Timeseries()
    {
        global $mock_query_result;
        $mock_query_result = [
            ['date' => '2023-01-01', 'et0_mm' => 1.1, 'water_ml' => 50],
            ['date' => '2023-01-02', 'et0_mm' => 1.2, 'water_ml' => 60]
        ];
        $_GET = ['plant_id' => 1, 'days' => 2];
        ob_start();
        @include __DIR__ . '/../api/get_et0_timeseries.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertCount(2, $data);
        $this->assertEquals('2023-01-01', $data[0]['date']);
    }
}
?>
