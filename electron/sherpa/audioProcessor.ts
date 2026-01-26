/**
 * Audio Processor Module
 * Handles audio format conversion, noise reduction, and preprocessing for Sherpa-ONNX
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { access, constants, existsSync, readFileSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { tmpdir } from 'os';
import { app } from 'electron';

// Configure ffmpeg and ffprobe paths for both development and production
const getFfmpegPath = (): string => {
  if (app.isPackaged) {
    // In production, ffmpeg is in app.asar.unpacked due to asarUnpack config
    const resourcesPath = process.resourcesPath;

    // First try: explicit resources/ffmpeg folder
    const ffmpegInResources = join(resourcesPath, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (existsSync(ffmpegInResources)) {
      return ffmpegInResources;
    }

    // Second try: app.asar.unpacked path (due to asarUnpack in electron-builder.yml)
    const ffmpegUnpacked = join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@ffmpeg-installer',
      process.platform === 'win32' ? 'win32-x64' : (process.platform === 'darwin' ? 'darwin-x64' : 'linux-x64'),
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );
    console.log('[AudioProcessor] Checking unpacked ffmpeg path:', ffmpegUnpacked);
    if (existsSync(ffmpegUnpacked)) {
      return ffmpegUnpacked;
    }

    console.warn('[AudioProcessor] FFmpeg not found in expected locations, falling back to installer path');
  }
  // Fall back to @ffmpeg-installer path (development mode)
  return ffmpegInstaller.path;
};

const getFfprobePath = (): string => {
  if (app.isPackaged) {
    // In production, ffprobe is in app.asar.unpacked due to asarUnpack config
    const resourcesPath = process.resourcesPath;

    // First try: explicit resources/ffprobe folder
    const ffprobeInResources = join(resourcesPath, 'ffprobe', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (existsSync(ffprobeInResources)) {
      return ffprobeInResources;
    }

    // Second try: app.asar.unpacked path (due to asarUnpack in electron-builder.yml)
    const ffprobeUnpacked = join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@ffprobe-installer',
      process.platform === 'win32' ? 'win32-x64' : (process.platform === 'darwin' ? 'darwin-x64' : 'linux-x64'),
      process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    );
    console.log('[AudioProcessor] Checking unpacked ffprobe path:', ffprobeUnpacked);
    if (existsSync(ffprobeUnpacked)) {
      return ffprobeUnpacked;
    }

    console.warn('[AudioProcessor] FFprobe not found in expected locations, falling back to installer path');
  }
  // Fall back to @ffprobe-installer path (development mode)
  return ffprobeInstaller.path;
};

// Set ffmpeg and ffprobe paths
try {
  const ffmpegPath = getFfmpegPath();
  const ffprobePath = getFfprobePath();
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  console.log('[AudioProcessor] FFmpeg path set:', ffmpegPath);
  console.log('[AudioProcessor] FFprobe path set:', ffprobePath);
} catch (e) {
  console.error('[AudioProcessor] Failed to set FFmpeg/FFprobe path:', e);
}

export interface AudioData {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  channels: number;
}

export interface ProcessingOptions {
  enableNoiseReduction?: boolean;
  targetSampleRate?: number;
}

export class AudioProcessor {
  private static readonly TARGET_SAMPLE_RATE = 16000;
  private static readonly HIGH_PASS_CUTOFF = 80;    // Hz - remove low frequency noise
  private static readonly LOW_PASS_CUTOFF = 8000;   // Hz - remove high frequency noise

  /**
   * Convert any audio format to 16kHz mono WAV
   */
  static async convertToWav(inputPath: string): Promise<string> {
    const tempDir = tmpdir();
    const outputPath = join(tempDir, `sherpa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.wav`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)           // Mono
        .audioFrequency(this.TARGET_SAMPLE_RATE)  // 16kHz
        .audioCodec('pcm_s16le')    // 16-bit PCM
        .format('wav')
        .on('start', (cmd) => {
          console.log('[AudioProcessor] FFmpeg started:', cmd);
        })
        .on('progress', (progress) => {
          console.log('[AudioProcessor] Processing:', progress.percent?.toFixed(1) + '%');
        })
        .on('end', () => {
          console.log('[AudioProcessor] Conversion complete:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[AudioProcessor] FFmpeg error:', err);
          reject(new Error(`Audio conversion failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Get audio file information
   */
  static async getAudioInfo(filePath: string): Promise<{
    duration: number;
    sampleRate: number;
    channels: number;
    format: string;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to probe audio file: ${err.message}`));
          return;
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        if (!audioStream) {
          reject(new Error('No audio stream found in file'));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : 0,
          channels: audioStream.channels || 0,
          format: metadata.format.format_name || 'unknown'
        });
      });
    });
  }

  /**
   * Read WAV file and return Float32Array samples
   */
  static readWavFile(wavPath: string): { samples: Float32Array; sampleRate: number } {
    const buffer = readFileSync(wavPath);

    // Parse WAV header
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') {
      throw new Error('Invalid WAV file: missing RIFF header');
    }

    const wave = buffer.toString('ascii', 8, 12);
    if (wave !== 'WAVE') {
      throw new Error('Invalid WAV file: missing WAVE format');
    }

    // Find fmt chunk
    let offset = 12;
    let sampleRate = 16000;
    let bitsPerSample = 16;
    let numChannels = 1;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ') {
        numChannels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        bitsPerSample = buffer.readUInt16LE(offset + 22);
      } else if (chunkId === 'data') {
        const dataOffset = offset + 8;
        const dataSize = chunkSize;

        // Convert to Float32Array
        const bytesPerSample = bitsPerSample / 8;
        const numSamples = dataSize / bytesPerSample;
        const samples = new Float32Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
          const sampleOffset = dataOffset + i * bytesPerSample;
          if (bitsPerSample === 16) {
            const sample = buffer.readInt16LE(sampleOffset);
            samples[i] = sample / 32768.0; // Normalize to -1.0 to 1.0
          } else if (bitsPerSample === 8) {
            const sample = buffer.readUInt8(sampleOffset);
            samples[i] = (sample - 128) / 128.0;
          }
        }

        return { samples, sampleRate };
      }

      offset += 8 + chunkSize;
      // Word alignment
      if (chunkSize % 2 !== 0) offset++;
    }

    throw new Error('Invalid WAV file: missing data chunk');
  }

  /**
   * Apply high-pass filter to remove low frequency noise (< cutoffFreq Hz)
   */
  static applyHighPassFilter(
    samples: Float32Array,
    sampleRate: number,
    cutoffFreq: number = this.HIGH_PASS_CUTOFF
  ): Float32Array {
    const RC = 1.0 / (2 * Math.PI * cutoffFreq);
    const dt = 1.0 / sampleRate;
    const alpha = RC / (RC + dt);

    const filtered = new Float32Array(samples.length);
    filtered[0] = samples[0];

    for (let i = 1; i < samples.length; i++) {
      filtered[i] = alpha * (filtered[i - 1] + samples[i] - samples[i - 1]);
    }

    return filtered;
  }

  /**
   * Apply low-pass filter to remove high frequency noise (> cutoffFreq Hz)
   */
  static applyLowPassFilter(
    samples: Float32Array,
    sampleRate: number,
    cutoffFreq: number = this.LOW_PASS_CUTOFF
  ): Float32Array {
    const RC = 1.0 / (2 * Math.PI * cutoffFreq);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (RC + dt);

    const filtered = new Float32Array(samples.length);
    filtered[0] = samples[0];

    for (let i = 1; i < samples.length; i++) {
      filtered[i] = filtered[i - 1] + alpha * (samples[i] - filtered[i - 1]);
    }

    return filtered;
  }

  /**
   * Normalize audio to prevent clipping
   */
  static normalize(samples: Float32Array, targetPeak: number = 0.95): Float32Array {
    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }

    if (maxAmp === 0 || maxAmp >= targetPeak) return samples;

    const normalized = new Float32Array(samples.length);
    const scale = targetPeak / maxAmp;

    for (let i = 0; i < samples.length; i++) {
      normalized[i] = samples[i] * scale;
    }

    return normalized;
  }

  /**
   * Apply combined noise reduction: high-pass + low-pass + normalization
   */
  static applyNoiseReduction(samples: Float32Array, sampleRate: number): Float32Array {
    console.log('[AudioProcessor] Applying noise reduction...');

    // 1. High-pass filter to remove low frequency noise (< 80Hz)
    let processed = this.applyHighPassFilter(samples, sampleRate, this.HIGH_PASS_CUTOFF);

    // 2. Low-pass filter to remove high frequency noise (> 8000Hz)
    processed = this.applyLowPassFilter(processed, sampleRate, this.LOW_PASS_CUTOFF);

    // 3. Normalize to prevent clipping
    processed = this.normalize(processed);

    console.log('[AudioProcessor] Noise reduction complete');
    return processed;
  }

  /**
   * Process audio file: convert format, apply noise reduction, return samples
   */
  static async processAudioFile(
    filePath: string,
    options: ProcessingOptions = {}
  ): Promise<AudioData> {
    const { enableNoiseReduction = true } = options;

    console.log('[AudioProcessor] Processing file:', filePath);

    // 1. Get audio info
    const info = await this.getAudioInfo(filePath);
    console.log('[AudioProcessor] Audio info:', info);

    // 2. Convert to WAV (16kHz mono)
    const wavPath = await this.convertToWav(filePath);

    try {
      // 3. Read WAV samples
      const { samples, sampleRate } = this.readWavFile(wavPath);
      console.log('[AudioProcessor] Read samples:', samples.length, 'at', sampleRate, 'Hz');

      // 4. Apply noise reduction if enabled
      let processedSamples = samples;
      if (enableNoiseReduction) {
        processedSamples = this.applyNoiseReduction(samples, sampleRate);
      }

      return {
        samples: processedSamples,
        sampleRate,
        duration: samples.length / sampleRate,
        channels: 1
      };
    } finally {
      // 5. Clean up temp file
      try {
        unlinkSync(wavPath);
        console.log('[AudioProcessor] Cleaned up temp file:', wavPath);
      } catch (e) {
        console.warn('[AudioProcessor] Failed to clean up temp file:', e);
      }
    }
  }

  /**
   * Check if a file is a supported audio format
   */
  static isSupportedFormat(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const supportedFormats = ['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac', '.wma', '.webm'];
    return supportedFormats.includes(ext);
  }

  /**
   * Check if FFmpeg is available
   */
  static async isFFmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpegPath = getFfmpegPath();
      access(ffmpegPath, constants.X_OK, (err) => {
        if (err) {
          console.warn('[AudioProcessor] FFmpeg not found at:', ffmpegPath);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}

export default AudioProcessor;
