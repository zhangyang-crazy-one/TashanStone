/**
 * OCR Model Download Script
 * Downloads PaddleOCR v4 models for esearch-ocr
 *
 * Usage: node scripts/download-ocr-model.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const MODELS_DIR = path.join(__dirname, '..', 'resources', 'ocr-models');

// Model download URLs (from eSearch releases)
// 注意：这些模型需要从 https://github.com/xushengfeng/eSearch/releases 手动下载 ch.zip
const MODELS = [
    {
        name: 'ppocr_det.onnx',
        url: 'https://github.com/xushengfeng/eSearch/releases/download/15.2.1/ch.zip',
        size: '~5MB',
        note: '从 ch.zip 中提取'
    },
    {
        name: 'ppocr_rec.onnx',
        url: 'https://github.com/xushengfeng/eSearch/releases/download/15.2.1/ch.zip',
        size: '~10MB',
        note: '从 ch.zip 中提取'
    },
    {
        name: 'ppocr_keys_v1.txt',
        url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/ppocr_keys_v1.txt',
        size: '0.1MB'
    }
];

/**
 * Download a file with redirect support
 */
function downloadFile(url, destPath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Too many redirects'));
            return;
        }

        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);

        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.unlinkSync(destPath);
                console.log(`  Redirecting to: ${response.headers.location}`);
                downloadFile(response.headers.location, destPath, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedSize = 0;

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize > 0) {
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    process.stdout.write(`\r  Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)}MB)`);
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log();
                resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            try {
                fs.unlinkSync(destPath);
            } catch (e) {
                // ignore
            }
            reject(err);
        });

        request.setTimeout(60000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

async function main() {
    console.log('=== OCR Model Downloader ===\n');
    console.log(`Target directory: ${MODELS_DIR}\n`);

    // Create models directory if not exists
    if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
        console.log('Created models directory\n');
    }

    let successCount = 0;
    let skipCount = 0;

    for (const model of MODELS) {
        const destPath = path.join(MODELS_DIR, model.name);

        if (fs.existsSync(destPath)) {
            const stats = fs.statSync(destPath);
            if (stats.size > 1000) { // Check file is not empty
                console.log(`[SKIP] ${model.name} (already exists, ${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
                skipCount++;
                continue;
            }
        }

        console.log(`[DOWNLOAD] ${model.name} (~${model.size})`);

        try {
            await downloadFile(model.url, destPath);
            console.log(`  Done!`);
            successCount++;
        } catch (error) {
            console.error(`  Failed: ${error.message}`);
        }
    }

    console.log('\n=== Summary ===');
    console.log(`Downloaded: ${successCount}`);
    console.log(`Skipped: ${skipCount}`);
    console.log(`Failed: ${MODELS.length - successCount - skipCount}`);

    // Verify all files exist
    console.log('\n=== Verification ===');
    let allPresent = true;
    for (const model of MODELS) {
        const destPath = path.join(MODELS_DIR, model.name);
        const exists = fs.existsSync(destPath);
        const size = exists ? fs.statSync(destPath).size : 0;
        const status = exists && size > 1000 ? '✓' : '✗';
        console.log(`${status} ${model.name} (${(size / 1024 / 1024).toFixed(2)}MB)`);
        if (!exists || size < 1000) allPresent = false;
    }

    if (allPresent) {
        console.log('\nAll models ready!');
        process.exit(0);
    } else {
        console.log('\nSome models are missing. Please download manually.');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
