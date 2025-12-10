const path = require('path');

const modelPath = path.join(process.cwd(), 'resources', 'sherpa-models');

// 先检查 WASM 模块
const wasmModule = require('./node_modules/sherpa-onnx/sherpa-onnx-wasm-nodejs.js')();

console.log('wasmModule type:', typeof wasmModule);
console.log('wasmModule.ready:', wasmModule.ready);

// 如果有 ready promise，等待它
async function main() {
    if (wasmModule.ready) {
        console.log('Waiting for WASM module to be ready...');
        await wasmModule.ready;
        console.log('WASM module ready!');
    }

    // 检查 WASM FS 是否能访问真实文件路径
    console.log('\n--- Testing WASM File System ---');
    const encoderPath = path.join(modelPath, 'encoder-epoch-99-avg-1.onnx');
    console.log('Encoder path:', encoderPath);

    // 使用 WASM 的 _SherpaOnnxFileExists 函数检查
    const fileExistsPtr = wasmModule._malloc(encoderPath.length + 1);
    wasmModule.stringToUTF8(encoderPath, fileExistsPtr, encoderPath.length + 1);
    const exists = wasmModule._SherpaOnnxFileExists(fileExistsPtr);
    wasmModule._free(fileExistsPtr);
    console.log('File exists in WASM FS:', exists);

    // 用 Node.js fs 检查
    const fs = require('fs');
    console.log('File exists in Node.js fs:', fs.existsSync(encoderPath));

    console.log('\n--- End File System Test ---\n');

    // 现在加载 sherpa-onnx
    const sherpa = require('sherpa-onnx');

const config = {
    featConfig: {
        sampleRate: 16000,
        featureDim: 80,
    },
    modelConfig: {
        transducer: {
            // 尝试使用 int8 量化版本
            encoder: path.join(modelPath, 'encoder-epoch-99-avg-1.int8.onnx'),
            decoder: path.join(modelPath, 'decoder-epoch-99-avg-1.int8.onnx'),
            joiner: path.join(modelPath, 'joiner-epoch-99-avg-1.int8.onnx'),
        },
        tokens: path.join(modelPath, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
        debug: 0,
        modelType: '',
        modelingUnit: '',
        bpeVocab: '',
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
};

    console.log('Creating recognizer...');

    // 打印实际配置
    console.log('Step 1: Actual config:');
    console.log('Encoder:', config.modelConfig.transducer.encoder);

    console.log('\nRunning with trace-uncaught to find the error source...');

    let recognizer;
    try {
        const sherpa = require('sherpa-onnx');
        recognizer = sherpa.createOnlineRecognizer(config);
        console.log('Recognizer created');
    } catch (e) {
        console.error('Error type:', typeof e);
        console.error('Error value:', e);
        console.error('Is number:', typeof e === 'number');
        if (typeof e === 'number' && e !== 0) {
            console.log('\n*** This is a valid handle being thrown as an error! ***');
            console.log('*** Attempting to use it as a handle... ***\n');

            // 手动创建一个类似 OnlineRecognizer 的对象
            recognizer = {
                handle: e,
                Module: wasmModule,
                config: config,
                createStream: function() {
                    const streamHandle = wasmModule._SherpaOnnxCreateOnlineStream(this.handle);
                    return {
                        handle: streamHandle,
                        Module: wasmModule,
                        acceptWaveform: function(sampleRate, samples) {
                            const numSamples = samples.length;
                            const samplesPtr = wasmModule._malloc(numSamples * 4);
                            wasmModule.HEAPF32.set(samples, samplesPtr / 4);
                            wasmModule._SherpaOnnxOnlineStreamAcceptWaveform(this.handle, sampleRate, samplesPtr, numSamples);
                            wasmModule._free(samplesPtr);
                        },
                        free: function() {
                            wasmModule._SherpaOnnxDestroyOnlineStream(this.handle);
                        }
                    };
                },
                isReady: function(stream) {
                    return wasmModule._SherpaOnnxIsOnlineStreamReady(this.handle, stream.handle) === 1;
                },
                decode: function(stream) {
                    wasmModule._SherpaOnnxDecodeOnlineStream(this.handle, stream.handle);
                },
                getResult: function(stream) {
                    const r = wasmModule._SherpaOnnxGetOnlineStreamResultAsJson(this.handle, stream.handle);
                    const jsonStr = wasmModule.UTF8ToString(r);
                    wasmModule._SherpaOnnxDestroyOnlineStreamResultJson(r);
                    return JSON.parse(jsonStr);
                },
                free: function() {
                    wasmModule._SherpaOnnxDestroyOnlineRecognizer(this.handle);
                }
            };
            console.log('Created manual wrapper with handle:', recognizer.handle);
        } else {
            return;
        }
    }

    console.log('Recognizer created successfully');
    console.log('Recognizer handle value:', recognizer.handle);

    if (!recognizer.handle || recognizer.handle === 0) {
        console.error('ERROR: Invalid recognizer handle');
        return;
    }

    console.log('SUCCESS: Recognizer created with handle:', recognizer.handle);

    // 创建 stream
    console.log('Creating stream...');
    let stream;
    try {
        stream = recognizer.createStream();
    } catch (e) {
        console.error('Error in createStream:', e);
        recognizer.free();
        return;
    }

    console.log('Stream handle value:', stream.handle);

    if (!stream.handle || stream.handle === 0) {
        console.error('ERROR: Invalid stream handle');
        recognizer.free();
        return;
    }

    console.log('SUCCESS: Stream created!');

    // 生成一些测试音频数据 (1秒的静音)
    const samples = new Float32Array(16000);
    console.log('Accepting waveform...');
    stream.acceptWaveform(16000, samples);

    console.log('Checking if ready...');
    const ready = recognizer.isReady(stream);
    console.log('Is ready:', ready);

    if (ready) {
        console.log('Decoding...');
        recognizer.decode(stream);
        const result = recognizer.getResult(stream);
        console.log('Result:', JSON.stringify(result));
    } else {
        console.log('Stream not ready for decoding yet');
    }

    // 清理
    stream.free();
    recognizer.free();

console.log('\nTest completed!');
}

main().catch(e => console.error('Main error:', e));
