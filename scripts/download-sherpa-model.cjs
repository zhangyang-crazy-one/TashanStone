/**
 * Sherpa-ONNX Model Downloader
 *
 * Downloads the streaming bilingual Chinese-English ASR model
 * for local speech recognition.
 *
 * Usage: node scripts/download-sherpa-model.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Model configuration
const MODEL_CONFIG = {
    name: 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2',
    // Alternative mirror for faster download in China
    mirrorUrl: 'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/resolve/main/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2',
    files: [
        'encoder-epoch-99-avg-1.onnx',
        'decoder-epoch-99-avg-1.onnx',
        'joiner-epoch-99-avg-1.onnx',
        'tokens.txt'
    ]
};

// Destination path
const DEST_DIR = path.join(__dirname, '..', 'resources', 'sherpa-models');

function getProtocol(url) {
    return url.startsWith('https') ? https : http;
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading from: ${url}`);
        console.log(`Destination: ${destPath}`);

        const protocol = getProtocol(url);
        const file = fs.createWriteStream(destPath);

        const request = protocol.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                console.log(`Redirecting to: ${response.headers.location}`);
                file.close();
                fs.unlinkSync(destPath);
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            let lastProgress = 0;

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const progress = Math.floor((downloadedSize / totalSize) * 100);
                if (progress !== lastProgress && progress % 10 === 0) {
                    console.log(`Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                    lastProgress = progress;
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log('Download completed!');
                resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            fs.unlinkSync(destPath);
            reject(err);
        });

        request.setTimeout(30000, () => {
            request.destroy();
            file.close();
            fs.unlinkSync(destPath);
            reject(new Error('Request timeout'));
        });
    });
}

function extractTarBz2(archivePath, destDir) {
    console.log('Extracting archive...');

    // Check if tar and bzip2 are available
    try {
        if (process.platform === 'win32') {
            // On Windows, use tar (available in Windows 10+)
            execSync(`tar -xjf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
        } else {
            execSync(`tar -xjf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
        }
        console.log('Extraction completed!');
    } catch (error) {
        console.error('Failed to extract with tar. Trying alternative method...');
        throw error;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('Sherpa-ONNX Model Downloader');
    console.log('='.repeat(60));
    console.log(`\nModel: ${MODEL_CONFIG.name}`);
    console.log(`Destination: ${DEST_DIR}\n`);

    // Create destination directory
    if (!fs.existsSync(DEST_DIR)) {
        fs.mkdirSync(DEST_DIR, { recursive: true });
        console.log(`Created directory: ${DEST_DIR}`);
    }

    // Check if model already exists
    const tokensPath = path.join(DEST_DIR, 'tokens.txt');
    if (fs.existsSync(tokensPath)) {
        console.log('\nModel already downloaded! Skipping...');
        console.log('To re-download, delete the directory:', DEST_DIR);
        return;
    }

    const archivePath = path.join(DEST_DIR, `${MODEL_CONFIG.name}.tar.bz2`);

    // Try primary URL first, then mirror
    let downloaded = false;
    const urls = [MODEL_CONFIG.url, MODEL_CONFIG.mirrorUrl];

    for (const url of urls) {
        try {
            await downloadFile(url, archivePath);
            downloaded = true;
            break;
        } catch (error) {
            console.error(`Failed to download from ${url}: ${error.message}`);
            console.log('Trying next URL...\n');
        }
    }

    if (!downloaded) {
        console.error('\nFailed to download model from all sources!');
        console.log('\nManual download instructions:');
        console.log('1. Download the model from:', MODEL_CONFIG.url);
        console.log('2. Extract the archive');
        console.log('3. Copy the model files to:', DEST_DIR);
        process.exit(1);
    }

    // Extract archive
    try {
        extractTarBz2(archivePath, DEST_DIR);
    } catch (error) {
        console.error('Extraction failed:', error.message);
        console.log('\nManual extraction instructions:');
        console.log('1. Extract the downloaded file:', archivePath);
        console.log('2. Copy the model files to:', DEST_DIR);
        process.exit(1);
    }

    // Move files from extracted directory to DEST_DIR
    const extractedDir = path.join(DEST_DIR, MODEL_CONFIG.name);
    if (fs.existsSync(extractedDir)) {
        console.log('\nMoving model files...');
        for (const file of MODEL_CONFIG.files) {
            const srcFile = path.join(extractedDir, file);
            const destFile = path.join(DEST_DIR, file);
            if (fs.existsSync(srcFile)) {
                fs.renameSync(srcFile, destFile);
                console.log(`  Moved: ${file}`);
            }
        }

        // Clean up extracted directory
        fs.rmSync(extractedDir, { recursive: true, force: true });
    }

    // Clean up archive
    if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
        console.log('\nCleaned up archive file.');
    }

    // Verify installation
    console.log('\nVerifying installation...');
    let allFilesExist = true;
    for (const file of MODEL_CONFIG.files) {
        const filePath = path.join(DEST_DIR, file);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`  ✓ ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
            console.log(`  ✗ ${file} - MISSING`);
            allFilesExist = false;
        }
    }

    if (allFilesExist) {
        console.log('\n✅ Model installation successful!');
        console.log('\nThe speech recognition feature is now ready to use.');
    } else {
        console.log('\n⚠️ Some model files are missing. Speech recognition may not work properly.');
    }
}

main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
});
