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

    public function testAddPlantInvalidName()
    {
        $_POST = [
            'name' => str_repeat('a', 101),
            'watering_frequency' => 5
        ];
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

    public function testDeletePlantInvalidId()
    {
        $_POST = ['id' => 'abc'];
        ob_start();
        include __DIR__ . '/../api/delete_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertFalse($data['success']);
        $this->assertArrayHasKey('error', $data);
    }

    public function testAddPlantWithWaterAmount()
    {
        $_POST = [
            'name' => 'Test Plant',
            'watering_frequency' => 5,
            'water_amount' => 100
        ];
        ob_start();
        include __DIR__ . '/../api/add_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertEquals('success', $data['status']);
    }

    public function testAddPlantWithDecimalWaterAmount()
    {
        $_POST = [
            'name' => 'Decimal Plant',
            'watering_frequency' => 5,
            'water_amount' => 123.45
        ];
        ob_start();
        include __DIR__ . '/../api/add_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertEquals('success', $data['status']);
    }

    public function testUpdatePlantWithWaterAmount()
    {
        $_POST = [
            'id' => 1,
            'name' => 'Updated',
            'watering_frequency' => 7,
            'water_amount' => 150,
            'last_watered' => '',
            'last_fertilized' => ''
        ];
        ob_start();
        include __DIR__ . '/../api/update_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertEquals('success', $data['status']);
    }

    public function testUpdatePlantInvalidName()
    {
        $_POST = [
            'id' => 1,
            'name' => str_repeat('b', 101),
            'watering_frequency' => 7,
            'water_amount' => 150
        ];
        ob_start();
        include __DIR__ . '/../api/update_plant.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertArrayHasKey('error', $data);
    }
}
?>
