import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Mic, MicOff, FileAudio, Upload, Check, AlertTriangle, Loader2, Save, Download, AudioWaveform, Volume2 } from 'lucide-react';
import { MarkdownFile } from '../types';
import { translations } from '../utils/translations';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { TranscriptionResults } from './VoiceTranscriptionModal/TranscriptionResults';
interface VoiceTranscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: MarkdownFile[];
  onSaveToFile: (fileId: string, content: string, mode: 'append' | 'replace') => void;
  onCreateNewFile: (content: string) => void;
  language?: 'en' | 'zh';
}
type TabType = 'realtime' | 'file';
export const VoiceTranscriptionModal: React.FC<VoiceTranscriptionModalProps> = ({
  isOpen,
  onClose,
  files,
  onSaveToFile,
  onCreateNewFile,
  language = 'en'
}) => {
  const t = translations[language].transcription;

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('realtime');

  // Real-time transcription state
  const [realtimeText, setRealtimeText] = useState('');
  const [partialText, setPartialText] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // File transcription state
  const [selectedAudioFile, setSelectedAudioFile] = useState<string | null>(null);
  const [audioInfo, setAudioInfo] = useState<{ duration?: number; sampleRate?: number; format?: string } | null>(null);
  const [enableNoiseReduction, setEnableNoiseReduction] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileText, setFileText] = useState('');

  // Target file state
  const [targetFileId, setTargetFileId] = useState<string>('');

  // Status state
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Sherpa availability
  const [sherpaAvailable, setSherpaAvailable] = useState(false);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false);

  // Volume visualization
  const [volumeLevel, setVolumeLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Use the proven speech recognition hook from ChatPanel
  const { isListening, isProcessing: isRecognitionProcessing, toggle, isSupported } = useSpeechRecognition({
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        setRealtimeText(prev => prev + (prev ? ' ' : '') + transcript);
        setPartialText('');
      } else {
        setPartialText(transcript);
      }
    },
    onEnd: () => {
      setStatus('idle');
    },
    onError: (error) => {
      setErrorMessage(error);
      setStatus('error');
    },
    continuous: true,
    language: language === 'zh' ? 'zh-CN' : 'en-US'
  });

  // Sync isListening state to status and handle recording timer
  useEffect(() => {
    if (isListening) {
      setStatus('recording');
      setErrorMessage('');
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start audio visualization
      startAudioVisualization();
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      stopAudioVisualization();
      if (!isRecognitionProcessing) {
        setStatus('idle');
      }
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isListening, isRecognitionProcessing]);

  // Audio visualization functions
  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      const updateVolume = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setVolumeLevel(average / 255);
        }
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err) {
      console.error('Failed to start audio visualization:', err);
    }
  };

  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setVolumeLevel(0);
  };

  // Check availability on mount
  useEffect(() => {
    if (isOpen && window.electronAPI?.sherpa) {
      Promise.all([
        window.electronAPI.sherpa.isAvailable(),
        window.electronAPI.sherpa.isFFmpegAvailable?.() || Promise.resolve(false)
      ]).then(([sherpa, ffmpeg]) => {
        setSherpaAvailable(sherpa);
        setFfmpegAvailable(ffmpeg);
      }).catch(() => {
        setSherpaAvailable(false);
        setFfmpegAvailable(false);
      });
    }
  }, [isOpen]);

  // Format time helper
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Toggle recording using the hook
  const toggleRecording = useCallback(() => {
    toggle();
  }, [toggle]);

  // Select audio file
  const selectAudioFile = async () => {
    try {
      const result = await window.electronAPI?.sherpa.selectAudioFile();
      if (result?.success && result.filePath) {
        setSelectedAudioFile(result.filePath);

        // Get audio info
        const info = await window.electronAPI?.sherpa.getAudioInfo(result.filePath);
        if (info?.success) {
          setAudioInfo({
            duration: info.duration,
            sampleRate: info.sampleRate,
            format: info.format
          });
        }
      }
    } catch (err: any) {
      console.error('Error selecting audio file:', err);
      setErrorMessage(err.message || t.error);
    }
  };

  // Transcribe audio file
  const transcribeFile = async () => {
    if (!selectedAudioFile) return;

    // 确保切换到文件标签
    setActiveTab('file');

    try {
      setIsProcessing(true);
      setStatus('processing');
      setErrorMessage('');

      const result = await window.electronAPI?.sherpa.transcribeFile(selectedAudioFile, {
        enableNoiseReduction,
        language: language === 'zh' ? 'zh' : 'en'
      });

      if (result?.success && result.text) {
        setFileText(result.text);
        setStatus('success');
      } else {
        throw new Error(result?.error || 'Transcription failed');
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMessage(err.message || t.error);
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentText = activeTab === 'realtime'
    ? (realtimeText + (partialText ? ' ' + partialText : ''))
    : fileText;
  const wordCount = currentText.trim()
    ? currentText.trim().split(/\s+/).filter(w => w.length > 0).length
    : 0;

  const handleTranscriptChange = useCallback((value: string) => {
    if (activeTab === 'realtime') {
      setRealtimeText(value);
      setPartialText('');
    } else {
      setFileText(value);
    }
  }, [activeTab]);

  // Save to file
  const handleSave = (mode: 'append' | 'replace') => {
    const text = currentText.trim();
    if (!text) {
      setErrorMessage(t.noContent);
      return;
    }

    if (targetFileId) {
      onSaveToFile(targetFileId, text, mode);
      onClose();
    } else {
      onCreateNewFile(text);
      onClose();
    }
  };

  // Clear text
  const clearText = () => {
    if (activeTab === 'realtime') {
      setRealtimeText('');
      setPartialText('');
    } else {
      setFileText('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-[rgb(var(--bg-main))] to-[rgb(var(--bg-panel))] rounded-xl shadow-2xl border border-[rgb(var(--border-main))] custom-scrollbar">
        {/* Header */}
        <div className="sticky top-0 z-10 relative px-5 py-3 border-b border-[rgb(var(--border-main))] bg-gradient-to-r from-[rgba(var(--primary-500)/0.15)] to-[rgba(var(--secondary-500)/0.15)] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--primary-500))] to-[rgb(var(--secondary-500))] flex items-center justify-center shadow-lg shadow-[rgba(var(--primary-500)/0.3)]">
              <Mic size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-[rgb(var(--primary-400))] to-[rgb(var(--secondary-400))] bg-clip-text text-transparent font-[var(--font-header)]">
                {language === 'zh' ? '语音转录' : 'Voice Transcriber'}
              </h1>
              <p className="text-xs text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">
                {language === 'zh' ? '实时录音或上传音频文件转文字' : 'Real-time or file-based speech-to-text'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[rgba(var(--text-primary)/0.1)] transition-colors"
          >
            <X size={20} className="text-[rgb(var(--text-secondary))]" />
          </button>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Real-time Recording Section */}
            <div className={`
              bg-[rgba(var(--bg-panel)/0.8)] backdrop-blur-lg rounded-xl p-4 border-2 transition-all duration-300
              ${activeTab === 'realtime'
                ? 'border-[rgb(var(--primary-500))] shadow-md shadow-[rgba(var(--primary-500)/0.15)]'
                : 'border-[rgb(var(--border-main))] hover:border-[rgb(var(--primary-400))]'
              }
            `}>
              <div
                className="cursor-pointer"
                onClick={() => setActiveTab('realtime')}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[rgba(var(--secondary-500)/0.2)] to-[rgba(var(--primary-500)/0.2)] flex items-center justify-center">
                    <Mic size={18} className="text-[rgb(var(--secondary-400))]" />
                  </div>
                  <h2 className="text-base font-bold text-[rgb(var(--text-primary))] font-[var(--font-header)]">
                    {t.realtime}
                  </h2>
                </div>
              </div>

              {/* Microphone Visualizer */}
              <div className="flex flex-col items-center py-2">
                <div className="relative">
                  {/* Pulse rings animation when recording */}
                  {isListening && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-[rgb(var(--primary-500))] animate-ping opacity-20"></div>
                      <div className="absolute inset-[-6px] rounded-full bg-[rgb(var(--primary-500))] animate-pulse opacity-10"></div>
                    </>
                  )}

                  {/* Main mic button */}
                  <button
                    onClick={toggleRecording}
                    disabled={!isSupported}
                    className={`
                      relative w-20 h-20 rounded-full flex items-center justify-center
                      transition-all duration-300 shadow-lg z-10
                      ${isListening
                        ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/30'
                        : 'bg-gradient-to-br from-[rgb(var(--secondary-500))] to-[rgb(var(--primary-500))] shadow-[rgba(var(--primary-500)/0.3)] hover:scale-105'
                      }
                      ${!isSupported ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    style={{
                      transform: isListening ? `scale(${1 + volumeLevel * 0.1})` : 'scale(1)',
                    }}
                  >
                    {isListening ? (
                      <MicOff size={28} className="text-white" />
                    ) : (
                      <Mic size={28} className="text-white" />
                    )}
                  </button>
                </div>

                {/* Recording status */}
                <div className="mt-3 text-center">
                  {isListening ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2 text-red-500 text-sm">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        <span className="font-medium font-[var(--font-primary)]">{t.recording || 'Recording...'}</span>
                      </div>
                      <p className="text-xl font-bold text-[rgb(var(--text-primary))] font-mono">
                        {formatTime(recordingTime)}
                      </p>

                      {/* Volume meter */}
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <Volume2 size={12} className="text-[rgb(var(--text-secondary))]" />
                        <div className="w-20 h-1.5 bg-[rgb(var(--bg-element))] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-100"
                            style={{ width: `${volumeLevel * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">
                      {t.clickToStart}
                    </p>
                  )}
                </div>
              </div>

              {/* Recording info */}
              <div className="mt-3 pt-3 border-t border-[rgb(var(--border-main))]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">
                    {language === 'zh' ? '转录实时更新' : 'Real-time updates'}
                  </span>
                  {isSupported ? (
                    <span className="flex items-center gap-1 text-green-500">
                      <Check size={12} />
                      <span>{language === 'zh' ? '已就绪' : 'Ready'}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-500">
                      <AlertTriangle size={12} />
                      <span>{language === 'zh' ? '不支持' : 'N/A'}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className={`
              bg-[rgba(var(--bg-panel)/0.8)] backdrop-blur-lg rounded-xl p-4 border-2 transition-all duration-300
              ${activeTab === 'file'
                ? 'border-[rgb(var(--primary-500))] shadow-md shadow-[rgba(var(--primary-500)/0.15)]'
                : 'border-[rgb(var(--border-main))] hover:border-[rgb(var(--primary-400))]'
              }
            `}>
              <div
                className="cursor-pointer"
                onClick={() => setActiveTab('file')}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[rgba(var(--primary-500)/0.2)] to-[rgba(var(--secondary-500)/0.2)] flex items-center justify-center">
                    <FileAudio size={18} className="text-[rgb(var(--primary-400))]" />
                  </div>
                  <h2 className="text-base font-bold text-[rgb(var(--text-primary))] font-[var(--font-header)]">
                    {t.fileRecognition}
                  </h2>
                </div>
              </div>

              {/* Sherpa availability warning */}
              {!sherpaAvailable && (
                <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs">
                  <AlertTriangle size={14} />
                  <span>{language === 'zh' ? 'Sherpa-ONNX 不可用' : 'Sherpa-ONNX unavailable'}</span>
                </div>
              )}

              {/* Drop zone */}
              <div
                onClick={selectAudioFile}
                className={`
                  border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-300
                  ${selectedAudioFile
                    ? 'border-[rgb(var(--primary-500))] bg-[rgba(var(--primary-500)/0.1)]'
                    : 'border-[rgb(var(--border-main))] hover:border-[rgb(var(--primary-500))] hover:bg-[rgba(var(--primary-500)/0.05)]'
                  }
                `}
              >
                {selectedAudioFile ? (
                  <div className="space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-lg bg-gradient-to-br from-[rgba(var(--primary-500)/0.2)] to-[rgba(var(--secondary-500)/0.2)] flex items-center justify-center">
                      <FileAudio size={24} className="text-[rgb(var(--primary-500))]" />
                    </div>
                    <p className="text-xs font-medium text-[rgb(var(--text-primary))] truncate font-[var(--font-primary)]">
                      {selectedAudioFile.split(/[/\\]/).pop()}
                    </p>
                    {audioInfo && (
                      <div className="flex items-center justify-center gap-2 text-xs text-[rgb(var(--text-secondary))]">
                        <span className="px-1.5 py-0.5 rounded bg-[rgb(var(--bg-element))]">{audioInfo.format?.toUpperCase()}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[rgb(var(--bg-element))]">{audioInfo.duration?.toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload size={28} className="mx-auto text-[rgb(var(--text-secondary))]" />
                    <p className="text-sm text-[rgb(var(--text-primary))] font-medium font-[var(--font-primary)]">{t.dragOrClick}</p>
                    <p className="text-xs text-[rgb(var(--text-secondary))] font-[var(--font-primary)]">{t.supportedFormats}</p>
                  </div>
                )}
              </div>

              {/* Options and transcribe button */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableNoiseReduction}
                      onChange={(e) => setEnableNoiseReduction(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[rgb(var(--border-main))] text-[rgb(var(--primary-500))] focus:ring-[rgb(var(--primary-500))]"
                    />
                    <span className="text-xs text-[rgb(var(--text-primary))] font-[var(--font-primary)]">{t.enableNoiseReduction}</span>
                  </label>

                  {!ffmpegAvailable && (
                    <span className="text-xs text-amber-500 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      FFmpeg
                    </span>
                  )}
                </div>

                <button
                  onClick={transcribeFile}
                  disabled={!selectedAudioFile || isProcessing || !sherpaAvailable}
                  className={`
                    w-full py-2 rounded-lg font-medium text-sm transition-all font-[var(--font-primary)]
                    ${selectedAudioFile && !isProcessing && sherpaAvailable
                      ? 'bg-gradient-to-r from-[rgb(var(--primary-500))] to-[rgb(var(--secondary-500))] text-white hover:shadow-md hover:shadow-[rgba(var(--primary-500)/0.3)]'
                      : 'bg-[rgb(var(--bg-element))] text-[rgb(var(--text-secondary))] cursor-not-allowed'
                    }
                  `}
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      {t.processing}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <AudioWaveform size={14} />
                      {language === 'zh' ? '开始转录' : 'Transcribe'}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Transcription Results Section */}
          <TranscriptionResults
            activeTab={activeTab}
            currentText={currentText}
            wordCount={wordCount}
            isListening={isListening}
            language={language}
            targetFileId={targetFileId}
            files={files}
            errorMessage={errorMessage}
            status={status}
            onClear={clearText}
            onTextChange={handleTranscriptChange}
            onTargetFileChange={(value) => setTargetFileId(value)}
            t={{
              transcriptPreview: t.transcriptPreview,
              clear: t.clear,
              targetFile: t.targetFile,
              newFile: t.newFile,
              transcriptionComplete: t.transcriptionComplete
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[rgb(var(--border-main))] bg-[rgba(var(--bg-panel)/0.5)]">
          <p className="text-xs text-[rgb(var(--text-secondary))] font-[var(--font-primary)] hidden sm:block">
            {language === 'zh'
              ? '语音识别由 Sherpa-ONNX 提供支持，支持离线使用'
              : 'Powered by Sherpa-ONNX, works offline'
            }
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-element))] transition-colors font-medium font-[var(--font-primary)]"
            >
              {translations[language].cancel}
            </button>
            <button
              onClick={() => handleSave('append')}
              disabled={!currentText.trim()}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm font-medium font-[var(--font-primary)]
                ${currentText.trim()
                  ? 'bg-[rgb(var(--bg-element))] text-[rgb(var(--text-primary))] hover:bg-[rgba(var(--primary-500)/0.2)] border border-[rgb(var(--border-main))]'
                  : 'bg-[rgb(var(--bg-element))] text-[rgb(var(--text-secondary))] cursor-not-allowed opacity-50'
                }
              `}
            >
              <Download size={14} />
              {t.appendToFile}
            </button>
            <button
              onClick={() => handleSave('replace')}
              disabled={!currentText.trim()}
              className={`
                flex items-center gap-1.5 px-4 py-1.5 rounded-lg transition-all text-sm font-semibold font-[var(--font-primary)]
                ${currentText.trim()
                  ? 'bg-gradient-to-r from-[rgb(var(--primary-500))] to-[rgb(var(--secondary-500))] text-white hover:shadow-md hover:shadow-[rgba(var(--primary-500)/0.3)]'
                  : 'bg-[rgb(var(--bg-element))] text-[rgb(var(--text-secondary))] cursor-not-allowed opacity-50'
                }
              `}
            >
              <Save size={14} />
              {targetFileId ? t.replaceContent : t.newFile}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceTranscriptionModal;
