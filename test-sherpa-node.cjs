// Test sherpa-onnx-node (native addon, not WASM)
const path = require('path');

const modelPath = path.join(process.cwd(), 'resources', 'sherpa-models');

// 使用 sherpa-onnx-node 原生版本
const sherpa = require('sherpa-onnx-node');

console.log('sherpa-onnx-node loaded');
console.log('Version:', sherpa.version);
console.log('Methods:', Object.keys(sherpa));

const config = {
    featConfig: {
        sampleRate: 16000,
        featureDim: 80,
    },
    modelConfig: {
        transducer: {
            encoder: path.join(modelPath, 'encoder-epoch-99-avg-1.onnx'),
            decoder: path.join(modelPath, 'decoder-epoch-99-avg-1.onnx'),
            joiner: path.join(modelPath, 'joiner-epoch-99-avg-1.onnx'),
        },
        tokens: path.join(modelPath, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
        debug: 1,
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

console.log('\nCreating recognizer...');
console.log('Encoder:', config.modelConfig.transducer.encoder);

try {
    // sherpa-onnx-node 使用 OnlineRecognizer 类构造函数
    const recognizer = new sherpa.OnlineRecognizer(config);
    console.log('Recognizer created successfully!');
    console.log('Recognizer handle:', recognizer.handle);

    if (recognizer.handle && recognizer.handle !== 0) {
        console.log('\n✅ SUCCESS: Recognizer created with handle:', recognizer.handle);

        // 创建 stream
        console.log('\nCreating stream...');
        const stream = recognizer.createStream();
        console.log('Stream created, handle:', stream.handle);

        if (stream.handle && stream.handle !== 0) {
            console.log('✅ Stream created successfully!');

            // 生成一些测试音频数据 (0.1秒的静音)
            const samples = new Float32Array(1600);
            console.log('\nAccepting waveform (1600 samples of silence)...');
            // sherpa-onnx-node 使用对象参数
            stream.acceptWaveform({samples: samples, sampleRate: 16000});

            console.log('Checking if ready...');
            const ready = recognizer.isReady(stream);
            console.log('Is ready:', ready);

            if (ready) {
                console.log('Decoding...');
                recognizer.decode(stream);
                const result = recognizer.getResult(stream);
                console.log('Result:', JSON.stringify(result));
            } else {
                console.log('Stream not ready for decoding yet (expected for short silence)');
            }

            // 清理
            stream.free();
            console.log('Stream freed');
        }

        recognizer.free();
        console.log('Recognizer freed');
    }
} catch (e) {
    console.error('Error:', e.message || e);
    console.error('Stack:', e.stack);
}

console.log('\n✅ Test completed!');
