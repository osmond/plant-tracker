-- Create table to log daily ET0 and derived water volume
CREATE TABLE IF NOT EXISTS et0_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plant_id INT NOT NULL,
    date DATE NOT NULL,
    et0_mm DECIMAL(5,2) NOT NULL,
    water_ml DECIMAL(7,1) NOT NULL,
    FOREIGN KEY (plant_id) REFERENCES plants(id)
);
