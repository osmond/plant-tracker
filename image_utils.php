<?php
function convert_to_webp(string $path): string {
    if (!extension_loaded('imagick')) {
        return $path;
    }
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if (!in_array($extension, ['jpg', 'jpeg', 'png', 'gif'])) {
        return $path;
    }
    $newPath = preg_replace('/\.(jpg|jpeg|png|gif)$/i', '.webp', $path);
    try {
        $image = new Imagick($path);
        // Adjust orientation based on EXIF metadata so images are upright
        if (method_exists($image, 'autoOrient')) {
            $image->autoOrient();
        }
        $image->setImageFormat('webp');
        $image->writeImage($newPath);
        $image->clear();
        $image->destroy();
        if ($newPath !== $path) {
            unlink($path);
        }
        return $newPath;
    } catch (Exception $e) {
        return $path;
    }
}

function generate_responsive_variants(string $path): void {
    if (!extension_loaded('imagick') || !file_exists($path)) {
        return;
    }
    $sizes = [400, 800];
    foreach ($sizes as $width) {
        try {
            $img = new Imagick($path);
            if (method_exists($img, 'autoOrient')) {
                $img->autoOrient();
            }
            $img->resizeImage($width, 0, Imagick::FILTER_LANCZOS, 1);
            $variantPath = preg_replace('/\.webp$/i', "-{$width}.webp", $path);
            $img->writeImage($variantPath);
            $img->clear();
            $img->destroy();
        } catch (Exception $e) {
            // ignore errors
        }
    }
}
?>
