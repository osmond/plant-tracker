<?php
use PHPUnit\Framework\TestCase;

class LoginTest extends TestCase
{
    private $configFile;

    protected function setUp(): void
    {
        $this->configFile = __DIR__ . '/../config.php';
        file_put_contents($this->configFile, "<?php return ['auth_password' => 'secret'];");
        putenv('TESTING=1');
    }

    protected function tearDown(): void
    {
        if (file_exists($this->configFile)) {
            unlink($this->configFile);
        }
    }

    public function testLoginSuccess()
    {
        $_POST = ['password' => 'secret'];
        ob_start();
        include __DIR__ . '/../api/login.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertTrue($data['success']);
    }

    public function testLoginFailure()
    {
        $_POST = ['password' => 'wrong'];
        ob_start();
        include __DIR__ . '/../api/login.php';
        $output = ob_get_clean();
        $data = json_decode($output, true);
        $this->assertArrayHasKey('error', $data);
    }
}
?>
