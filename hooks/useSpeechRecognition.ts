import { useState, useEffect, useRef, useCallback } from 'react';
import { SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from '../types';

interface UseSpeechRecognitionProps {
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  language?: string;
}

type RecognitionMethod = 'sherpa' | 'whisper' | 'webspeech' | null;

export const useSpeechRecognition = ({
  onResult,
  onEnd,
  onError,
  continuous = false,
  language = 'en-US'
}: UseSpeechRecognitionProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionMethod, setRecognitionMethod] = useState<RecognitionMethod>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const sherpaSessionIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Use refs to keep latest callbacks without triggering effect re-runs
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);

  // Update refs when props change
  useEffect(() => {
    onResultRef.current = onResult;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  }, [onResult, onEnd, onError]);

  // Check if running in Electron with Sherpa/Whisper support
  const isElectron = typeof window !== 'undefined' && window.electronAPI;
  const hasSherpa = isElectron && window.electronAPI?.sherpa;
  const hasWhisper = isElectron && window.electronAPI?.whisper;

  // Check Web Speech API availability
  const webSpeechSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Check recognition method availability on mount
  useEffect(() => {
    const checkMethods = async () => {
      // Priority: Sherpa > Whisper > WebSpeech
      if (hasSherpa) {
        try {
          const sherpaAvailable = await window.electronAPI.sherpa.isAvailable?.();
          if (sherpaAvailable) {
            setRecognitionMethod('sherpa');
            console.info('[Speech] Using Sherpa-ONNX for speech recognition');
            return;
          }
        } catch (e) {
          console.debug('[Speech] Sherpa check failed:', e);
        }
      }

      if (hasWhisper) {
        try {
          const whisperAvailable = await window.electronAPI.whisper.isAvailable?.();
          if (whisperAvailable) {
            setRecognitionMethod('whisper');
            console.info('[Speech] Using Whisper for speech recognition');
            return;
          }
        } catch (e) {
          console.debug('[Speech] Whisper check failed:', e);
        }
      }

      if (webSpeechSupported) {
        setRecognitionMethod('webspeech');
        console.info('[Speech] Using Web Speech API for speech recognition');
        return;
      }

      setRecognitionMethod(null);
      console.warn('[Speech] No speech recognition method available');
    };

    checkMethods();
  }, [hasSherpa, hasWhisper, webSpeechSupported]);

  // Initialize Web Speech API when needed
  useEffect(() => {
    if (recognitionMethod !== 'webspeech' || !webSpeechSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript || interimTranscript) {
        if (onResultRef.current) {
          onResultRef.current(finalTranscript || interimTranscript, !!finalTranscript);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') {
        setIsListening(false);
        return;
      }

      console.error('Speech recognition error', event.error);
      if (onErrorRef.current) {
        onErrorRef.current(event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (onEndRef.current) {
        onEndRef.current();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [continuous, language, recognitionMethod, webSpeechSupported]);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Clear send interval
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    // Clear audio buffer queue
    audioBufferQueueRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Audio buffer for accumulating samples before sending to Sherpa
  const audioBufferQueueRef = useRef<Float32Array[]>([]);
  const sendIntervalRef = useRef<number | null>(null);
  const targetSampleRate = 16000;

  // Resample audio from source sample rate to target sample rate (16kHz)
  const resampleAudio = useCallback((inputSamples: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array => {
    if (inputSampleRate === outputSampleRate) {
      return inputSamples;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputSamples.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples.length - 1);
      const t = srcIndex - srcIndexFloor;

      // Linear interpolation
      output[i] = inputSamples[srcIndexFloor] * (1 - t) + inputSamples[srcIndexCeil] * t;
    }

    return output;
  }, []);

  // Send accumulated audio buffer to Sherpa
  const sendAccumulatedAudio = useCallback(async () => {
    if (!sherpaSessionIdRef.current || audioBufferQueueRef.current.length === 0) return;

    // Concatenate all accumulated buffers
    const totalLength = audioBufferQueueRef.current.reduce((sum, buf) => sum + buf.length, 0);
    if (totalLength === 0) return;

    const combinedBuffer = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of audioBufferQueueRef.current) {
      combinedBuffer.set(buf, offset);
      offset += buf.length;
    }

    // Clear the queue
    audioBufferQueueRef.current = [];

    // Convert to ArrayBuffer for IPC
    const audioBuffer = combinedBuffer.buffer.slice(
      combinedBuffer.byteOffset,
      combinedBuffer.byteOffset + combinedBuffer.byteLength
    ) as ArrayBuffer;

    try {
      const result = await window.electronAPI.sherpa.feedAudio(
        sherpaSessionIdRef.current,
        audioBuffer,
        targetSampleRate
      );

      if (result.success && result.text) {
        if (onResultRef.current) {
          onResultRef.current(result.text, !result.isPartial);
        }
      }
    } catch (err) {
      console.error('Error feeding audio to Sherpa:', err);
    }
  }, []);

  const startSherpaStreaming = useCallback(async () => {
    try {
      // Get microphone stream - let browser choose optimal sample rate
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      // Create audio context - use browser's default sample rate for better compatibility
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const actualSampleRate = audioContext.sampleRate;
      console.log(`[Sherpa] Audio context sample rate: ${actualSampleRate}Hz`);

      const source = audioContext.createMediaStreamSource(stream);

      // Generate session ID
      const sessionId = `session_${Date.now()}`;
      sherpaSessionIdRef.current = sessionId;

      // Start Sherpa session
      const startResult = await window.electronAPI.sherpa.startSession(sessionId);
      if (!startResult.success) {
        throw new Error(startResult.error || 'Failed to start Sherpa session');
      }

      // Clear audio buffer queue
      audioBufferQueueRef.current = [];

      // Use larger buffer size for better performance (8192 samples ~ 170ms at 48kHz)
      const bufferSize = 8192;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      // Process audio in the callback - just accumulate, don't await
      processor.onaudioprocess = (e) => {
        if (!sherpaSessionIdRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Resample to 16kHz if needed
        const resampledData = resampleAudio(inputData, actualSampleRate, targetSampleRate);

        // Copy data (inputData is reused by the audio context)
        const dataCopy = new Float32Array(resampledData.length);
        dataCopy.set(resampledData);

        // Accumulate in queue
        audioBufferQueueRef.current.push(dataCopy);
      };

      // Set up interval to send accumulated audio every 300ms
      // This reduces IPC frequency while maintaining responsiveness
      sendIntervalRef.current = window.setInterval(() => {
        sendAccumulatedAudio();
      }, 300);

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      console.log('[Sherpa] Streaming started');
    } catch (err) {
      console.error('Failed to start Sherpa streaming:', err);
      cleanup();
      if (onErrorRef.current) {
        onErrorRef.current((err as Error).message);
      }
    }
  }, [cleanup, resampleAudio, sendAccumulatedAudio]);

  const stopSherpaStreaming = useCallback(async () => {
    if (!sherpaSessionIdRef.current) return;

    setIsProcessing(true);

    // Stop the send interval first
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }

    try {
      // Send any remaining accumulated audio before ending
      await sendAccumulatedAudio();

      const result = await window.electronAPI.sherpa.endSession(sherpaSessionIdRef.current);

      if (result.success && result.text) {
        if (onResultRef.current) {
          onResultRef.current(result.text, true);
        }
      }
    } catch (err) {
      console.error('Error ending Sherpa session:', err);
      if (onErrorRef.current) {
        onErrorRef.current((err as Error).message);
      }
    } finally {
      sherpaSessionIdRef.current = null;
      cleanup();
      setIsListening(false);
      setIsProcessing(false);
      if (onEndRef.current) {
        onEndRef.current();
      }
    }
  }, [cleanup, sendAccumulatedAudio]);

  const startWhisperRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsProcessing(true);

        try {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await audioBlob.arrayBuffer();

          const whisperLang = language.startsWith('zh') ? 'zh' : (language.startsWith('en') ? 'en' : 'auto');
          const result = await window.electronAPI.whisper.transcribe(arrayBuffer, whisperLang);

          if (result.success && result.text) {
            if (onResultRef.current) {
              onResultRef.current(result.text, true);
            }
          } else {
            throw new Error(result.error || 'Transcription failed');
          }
        } catch (err) {
          console.error('Whisper transcription error:', err);
          if (onErrorRef.current) {
            onErrorRef.current((err as Error).message);
          }
        } finally {
          setIsProcessing(false);
          cleanup();
          if (onEndRef.current) {
            onEndRef.current();
          }
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start Whisper recording:', err);
      if (onErrorRef.current) {
        onErrorRef.current((err as Error).message);
      }
    }
  }, [language, cleanup]);

  const stopWhisperRecording = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
    }
  }, [isListening]);

  const start = useCallback(async () => {
    if (isListening || isProcessing) return;

    try {
      switch (recognitionMethod) {
        case 'sherpa':
          await startSherpaStreaming();
          break;
        case 'whisper':
          await startWhisperRecording();
          break;
        case 'webspeech':
          if (recognitionRef.current) {
            recognitionRef.current.start();
            setIsListening(true);
          }
          break;
        default:
          if (onErrorRef.current) {
            onErrorRef.current('No speech recognition method available');
          }
      }
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      if (onErrorRef.current) {
        onErrorRef.current((err as Error).message);
      }
      setIsListening(false);
      setIsProcessing(false);
    }
  }, [isListening, isProcessing, recognitionMethod, startSherpaStreaming, startWhisperRecording]);

  const stop = useCallback(() => {
    switch (recognitionMethod) {
      case 'sherpa':
        stopSherpaStreaming();
        break;
      case 'whisper':
        stopWhisperRecording();
        break;
      case 'webspeech':
        if (recognitionRef.current && isListening) {
          recognitionRef.current.stop();
          setIsListening(false);
        }
        break;
    }
  }, [recognitionMethod, isListening, stopSherpaStreaming, stopWhisperRecording]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  const isSupported = recognitionMethod !== null;

  return {
    isListening,
    isProcessing,
    start,
    stop,
    toggle,
    isSupported,
    recognitionMethod
  };
};
