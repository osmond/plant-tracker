<?php
use PHPUnit\Framework\TestCase;

class ApiTest extends TestCase
{
    private $dbConfig;
    protected function setUp(): void
    {
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

    public function testAddPlantWithNotes()
    {
        $_POST = ['name' => 'Rose', 'notes' => 'test note'];
        $_FILES = [];
        ob_start();
        include __DIR__ . '/../api/add_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertEquals('success', $data['status']);
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
        ob_start();
        include __DIR__ . '/../api/get_history.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertIsArray($data);
    }
}
?>
