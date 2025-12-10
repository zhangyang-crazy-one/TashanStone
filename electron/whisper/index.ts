import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';

/**
 * Whisper 配置选项
 */
export interface WhisperConfig {
    /** 自定义模型路径 */
    modelPath?: string;
    /** 语言代码: 'en', 'zh', 'auto' */
    language?: string;
    /** 模型大小: tiny < base < small < medium */
    modelSize?: 'tiny' | 'base' | 'small' | 'medium';
}

/**
 * 语音识别结果
 */
export interface TranscriptionResult {
    /** 是否成功 */
    success: boolean;
    /** 识别的文本内容 */
    text?: string;
    /** 检测到的语言 */
    language?: string;
    /** 错误信息 */
    error?: string;
}

/**
 * Whisper 语音识别服务
 *
 * 设计理念:
 * - 作为 Web Speech API 的可选增强
 * - 需要用户手动安装 whisper.cpp 或 whisper CLI
 * - 支持离线语音识别
 * - 更好的中文识别效果
 */
export class WhisperService {
    private whisperPath: string | null = null;
    private modelPath: string | null = null;
    private isChecked = false;

    /**
     * 检查 Whisper 是否可用
     *
     * 检查系统是否安装了 whisper 命令行工具
     * Windows: where whisper
     * Unix/macOS: which whisper
     *
     * @returns 是否可用
     */
    async isAvailable(): Promise<boolean> {
        // 避免重复检查
        if (this.isChecked) {
            return this.whisperPath !== null;
        }

        try {
            const cmd = process.platform === 'win32' ? 'where' : 'which';
            const whisperCmd = 'whisper';

            // 尝试查找 whisper 可执行文件
            const result = await this.execCommand(cmd, [whisperCmd]);

            if (result.success && result.stdout) {
                // Windows 的 where 可能返回多行,取第一行
                const paths = result.stdout.trim().split(/\r?\n/);
                this.whisperPath = paths[0].trim();
                logger.info(`Whisper found at: ${this.whisperPath}`);
                this.isChecked = true;
                return true;
            }
        } catch (error: any) {
            logger.debug('Whisper not found in system PATH', { error: error.message });
        }

        this.isChecked = true;
        return false;
    }

    /**
     * 转录音频文件
     *
     * 流程:
     * 1. 将 audioBuffer 保存为临时 WAV 文件
     * 2. 调用 whisper 命令行进行转录
     * 3. 读取输出文本
     * 4. 清理临时文件
     *
     * @param audioBuffer 音频数据
     * @param config 配置选项
     * @returns 转录结果
     */
    async transcribe(
        audioBuffer: Buffer,
        config: WhisperConfig = {}
    ): Promise<TranscriptionResult> {
        // 检查 Whisper 是否可用
        if (!await this.isAvailable()) {
            return {
                success: false,
                error: 'Whisper is not installed. Please install whisper.cpp or use Web Speech API instead.'
            };
        }

        let tempAudioPath: string | null = null;
        let tempOutputPath: string | null = null;

        try {
            // 创建临时文件路径
            const tempDir = os.tmpdir();
            const timestamp = Date.now();
            tempAudioPath = path.join(tempDir, `whisper_input_${timestamp}.wav`);
            tempOutputPath = path.join(tempDir, `whisper_output_${timestamp}.txt`);

            // 保存音频到临时文件
            await fs.writeFile(tempAudioPath, audioBuffer);
            logger.debug(`Audio saved to temp file: ${tempAudioPath}`);

            // 构建 whisper 命令参数
            const args: string[] = [
                tempAudioPath,
                '--output-txt',
                '--output-file', tempOutputPath.replace('.txt', ''), // whisper 会自动添加 .txt
            ];

            // 添加语言参数
            if (config.language && config.language !== 'auto') {
                args.push('--language', config.language);
            }

            // 添加模型参数
            if (config.modelSize) {
                args.push('--model', config.modelSize);
            } else {
                // 默认使用 base 模型 (平衡速度和准确度)
                args.push('--model', 'base');
            }

            // 如果提供了自定义模型路径
            if (config.modelPath) {
                args.push('--model-path', config.modelPath);
            }

            // 执行 whisper 命令
            logger.info('Starting Whisper transcription', { args });
            const result = await this.execCommand(this.whisperPath!, args, {
                timeout: 60000 // 60秒超时
            });

            if (!result.success) {
                throw new Error(result.stderr || 'Whisper command failed');
            }

            // 读取输出文件
            const transcription = await fs.readFile(tempOutputPath, 'utf-8');
            const text = transcription.trim();

            logger.info('Whisper transcription completed', {
                textLength: text.length,
                language: config.language
            });

            return {
                success: true,
                text,
                language: config.language
            };

        } catch (error: any) {
            logger.error('Whisper transcription failed', { error: error.message });
            return {
                success: false,
                error: error.message || 'Unknown error during transcription'
            };

        } finally {
            // 清理临时文件
            try {
                if (tempAudioPath) {
                    await fs.unlink(tempAudioPath);
                }
                if (tempOutputPath) {
                    await fs.unlink(tempOutputPath);
                }
            } catch (cleanupError: any) {
                logger.warn('Failed to cleanup temp files', { error: cleanupError.message });
            }
        }
    }

    /**
     * 获取推荐的语音识别方法
     *
     * 策略:
     * - Web Speech API 作为主要方案 (无需安装,实时识别)
     * - Whisper 作为可选增强 (需要安装,更好的离线识别)
     *
     * @returns 推荐的方法
     */
    getRecommendedMethod(): 'webspeech' | 'whisper' {
        // 默认推荐 Web Speech API
        // 因为它无需额外安装,且支持实时流式识别
        return 'webspeech';
    }

    /**
     * 执行命令并返回结果
     *
     * @param command 命令
     * @param args 参数
     * @param options 选项
     * @returns 执行结果
     */
    private execCommand(
        command: string,
        args: string[],
        options: { timeout?: number } = {}
    ): Promise<{ success: boolean; stdout: string; stderr: string }> {
        return new Promise((resolve) => {
            const child = spawn(command, args, {
                windowsHide: true,
                timeout: options.timeout
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                resolve({
                    success: code === 0,
                    stdout,
                    stderr
                });
            });

            child.on('error', (error) => {
                resolve({
                    success: false,
                    stdout,
                    stderr: error.message
                });
            });
        });
    }
}

/**
 * 单例 Whisper 服务实例
 */
export const whisperService = new WhisperService();
