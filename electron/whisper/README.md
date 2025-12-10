# Whisper 语音识别集成指南

## 概述

本项目实现了混合语音识别方案，支持 Web Speech API (主要) 和 Whisper (可选增强)。

## 设计理念

### 为什么采用混合方案?

1. **Web Speech API (优先)**
   - ✅ 浏览器原生支持,无需额外依赖
   - ✅ 实时流式识别
   - ✅ Chrome/Edge 支持良好
   - ✅ 零配置,开箱即用
   - ⚠️ 需要网络连接 (Google 服务)
   - ⚠️ 隐私问题 (音频发送到服务器)

2. **Whisper (可选增强)**
   - ✅ 完全离线工作
   - ✅ 更好的中文识别
   - ✅ 更高的隐私保护
   - ⚠️ 需要用户手动安装 whisper.cpp
   - ⚠️ 需要下载模型文件 (几百MB)
   - ⚠️ 非实时 (需要完整音频)

## 暴露的 IPC API

### 1. `window.electronAPI.whisper.isAvailable()`

检查系统是否安装了 Whisper。

```typescript
const hasWhisper = await window.electronAPI.whisper.isAvailable();
if (hasWhisper) {
  console.log('Whisper 可用,可以提供离线识别选项');
}
```

**返回值**: `Promise<boolean>`

### 2. `window.electronAPI.whisper.getRecommendedMethod()`

获取推荐的语音识别方法。

```typescript
const method = await window.electronAPI.whisper.getRecommendedMethod();
// 返回 'webspeech' 或 'whisper'
```

**返回值**: `Promise<'webspeech' | 'whisper'>`

**说明**: 当前版本总是返回 `'webspeech'`,因为它是最便捷的方案。

### 3. `window.electronAPI.whisper.transcribe(audioBuffer, language?)`

使用 Whisper 转录音频 (仅当 Whisper 可用时)。

```typescript
// 录制音频
const mediaRecorder = new MediaRecorder(stream);
const chunks: BlobPart[] = [];

mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(chunks, { type: 'audio/wav' });
  const audioBuffer = await audioBlob.arrayBuffer();

  // 调用 Whisper
  const result = await window.electronAPI.whisper.transcribe(
    audioBuffer,
    'zh' // 可选: 'en', 'zh', 'auto'
  );

  if (result.success) {
    console.log('识别结果:', result.text);
  } else {
    console.error('识别失败:', result.error);
  }
};
```

**参数**:
- `audioBuffer: ArrayBuffer` - 音频数据 (WAV 格式)
- `language?: string` - 可选,语言代码 ('en', 'zh', 'auto')

**返回值**: `Promise<TranscriptionResult>`

```typescript
interface TranscriptionResult {
  success: boolean;
  text?: string;        // 识别的文本
  language?: string;    // 使用的语言
  error?: string;       // 错误信息
}
```

## 前端实现建议

### 推荐的语音识别选择逻辑

```typescript
async function getSpeechRecognition() {
  // 1. 优先检查 Web Speech API
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    console.log('使用 Web Speech API');
    return {
      type: 'webspeech',
      recognition: new SpeechRecognition()
    };
  }

  // 2. 检查是否在 Electron 中且 Whisper 可用
  if (window.electronAPI?.whisper) {
    const hasWhisper = await window.electronAPI.whisper.isAvailable();
    if (hasWhisper) {
      console.log('使用 Whisper (离线)');
      return {
        type: 'whisper',
        transcribe: window.electronAPI.whisper.transcribe
      };
    }
  }

  // 3. 都不可用
  console.warn('没有可用的语音识别方案');
  return null;
}
```

### Web Speech API 使用示例

```typescript
function startWebSpeechRecognition(language: 'en-US' | 'zh-CN' = 'zh-CN') {
  const recognition = new webkitSpeechRecognition();

  recognition.lang = language;
  recognition.continuous = true;    // 持续识别
  recognition.interimResults = true; // 显示临时结果

  recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const transcript = event.results[last][0].transcript;

    if (event.results[last].isFinal) {
      console.log('最终结果:', transcript);
      // 插入到编辑器
    } else {
      console.log('临时结果:', transcript);
      // 实时显示
    }
  };

  recognition.onerror = (event) => {
    console.error('识别错误:', event.error);
  };

  recognition.start();
  return recognition;
}
```

### Whisper 使用示例

```typescript
async function startWhisperRecognition(language: 'en' | 'zh' = 'zh') {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm'
  });

  const chunks: BlobPart[] = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(chunks, { type: 'audio/wav' });
    const audioBuffer = await audioBlob.arrayBuffer();

    console.log('开始 Whisper 转录...');
    const result = await window.electronAPI.whisper.transcribe(
      audioBuffer,
      language
    );

    if (result.success) {
      console.log('识别成功:', result.text);
      // 插入到编辑器
    } else {
      console.error('识别失败:', result.error);
      alert(`识别失败: ${result.error}`);
    }

    // 释放资源
    stream.getTracks().forEach(track => track.stop());
  };

  // 开始录音
  mediaRecorder.start();

  // 返回控制器
  return {
    stop: () => mediaRecorder.stop(),
    isRecording: () => mediaRecorder.state === 'recording'
  };
}
```

## 用户安装 Whisper 指南

### 方式一: Whisper.cpp (推荐)

1. 访问 https://github.com/ggerganov/whisper.cpp
2. 下载预编译版本或从源码编译
3. 将 `whisper` 添加到系统 PATH

### 方式二: OpenAI Whisper (Python)

```bash
pip install openai-whisper
```

### 模型下载

Whisper 会在首次使用时自动下载模型,或手动下载:

```bash
# 下载 base 模型 (推荐,约 142MB)
whisper --model base --language zh dummy.wav

# 其他模型大小:
# tiny:   39 MB  - 最快,准确度较低
# base:  142 MB  - 平衡速度和准确度 (默认)
# small: 466 MB  - 更好的准确度
# medium: 1.5 GB - 高准确度,较慢
```

## 配置示例 (前端)

建议在设置界面添加语音识别配置:

```typescript
interface VoiceSettings {
  preferredMethod: 'auto' | 'webspeech' | 'whisper';
  language: 'auto' | 'en' | 'zh';
  continuous: boolean;          // 仅 Web Speech
  interimResults: boolean;      // 仅 Web Speech
  whisperModel?: 'tiny' | 'base' | 'small' | 'medium'; // 仅 Whisper
}
```

## 常见问题

### Q: 为什么 Web Speech API 不工作?

A:
1. 检查浏览器兼容性 (需要 Chrome/Edge)
2. 检查麦克风权限
3. 需要 HTTPS 或 localhost 环境

### Q: 如何判断用户已安装 Whisper?

A:
```typescript
if (window.electronAPI?.whisper) {
  const available = await window.electronAPI.whisper.isAvailable();
  console.log('Whisper 可用:', available);
}
```

### Q: Whisper 转录需要多久?

A: 取决于:
- 音频长度 (1分钟音频约需 5-10 秒)
- 模型大小 (tiny 最快,medium 最慢)
- CPU 性能

### Q: 可以同时使用两种方案吗?

A: 建议二选一:
- **实时场景**: 用 Web Speech API (边说边显示)
- **离线/隐私场景**: 用 Whisper (录完后转录)

## 下一步

前端需要实现:
1. 麦克风权限请求
2. 录音 UI 组件 (开始/停止按钮,波形显示)
3. 语音识别结果插入编辑器
4. 错误处理和用户反馈
5. 设置界面 (语言选择,方法选择)

参考 Phase 4.2 前端语音输入 UI 实现。
