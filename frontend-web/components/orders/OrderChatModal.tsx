'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Send, X, ShieldCheck, Mic, Square, Trash2, Play, Pause, Check, CheckCheck, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { orderService, OrderMessage } from '@/lib/services/order.service';
import { useToast } from '@/components/ui/toast';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { useT } from '@/lib/i18n';
import { ordersMessages } from '@/lib/i18n/messages/orders';

interface OrderChatModalProps {
  orderId: string;
  orderNumber: string;
  sellerName?: string;
  customerName?: string;
  currentRole?: 'customer' | 'seller' | 'rider';
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Double Tick Status Component (Sent vs Read)
 */
function StatusTicks({ isRead, isMeBubble = false }: { isRead: boolean; isMeBubble?: boolean }) {
  const t = useT(ordersMessages);
  if (isRead) {
    return (
      <span className="inline-flex items-center text-sky-400 ms-1" title={t('chat.seen')}>
        <CheckCheck className="w-3.5 h-3.5 stroke-[2.5]" />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center ms-1 ${isMeBubble ? 'text-white/70' : 'text-slate-400'}`}
      title={t('chat.delivered')}
    >
      <CheckCheck className="w-3.5 h-3.5 stroke-[2]" />
    </span>
  );
}

/**
 * Audio Player for Voice Messages
 */
function VoiceNotePlayer({
  mediaUrl,
  duration,
  isMeBubble = false,
}: {
  mediaUrl: string;
  duration?: number | null;
  isMeBubble?: boolean;
}) {
  const t = useT(ordersMessages);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatSeconds = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error('Audio play failed:', err));
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    const total = audioRef.current.duration || duration || 1;
    setCurrentTime(curr);
    setProgress((curr / total) * 100);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const total = audioRef.current.duration || duration || 1;
    const newTime = (clickX / width) * total;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress((newTime / total) * 100);
  };

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-2xl min-w-[240px] max-w-[300px] ${
        isMeBubble ? 'bg-black/15 text-white' : 'bg-slate-100 text-slate-800'
      }`}
    >
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-xs shrink-0 ${
          isMeBubble ? 'bg-white text-emerald-800' : 'bg-slate-900 text-white'
        }`}
        title={isPlaying ? t('chat.pauseVoice') : t('chat.playVoice')}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ms-0.5" />}
      </button>

      {/* Progress & Waveform */}
      <div className="flex-1 space-y-1.5 cursor-pointer" onClick={handleSeek}>
        <div className="flex items-center justify-between text-[11px] font-bold opacity-80">
          <span className="flex items-center gap-1">
            <Mic className="w-3 h-3" />
            <span>{t('chat.voiceNote')}</span>
          </span>
          <span>{formatSeconds(isPlaying ? currentTime : duration || 0)}</span>
        </div>

        {/* Progress Bar / Waveform Simulator */}
        <div className="relative w-full h-2 bg-black/15 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 rounded-full ${
              isMeBubble ? 'bg-white' : 'bg-emerald-600'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>

      {/* Speed Button */}
      <button
        onClick={cycleSpeed}
        className={`text-[11px] font-black px-1.5 py-0.5 rounded-md border shrink-0 ${
          isMeBubble
            ? 'border-white/30 hover:bg-white/10 text-white'
            : 'border-slate-300 hover:bg-slate-200 text-slate-700'
        }`}
        title={t('chat.changeSpeed')}
      >
        {playbackRate}x
      </button>
    </div>
  );
}

export default function OrderChatModal({
  orderId,
  orderNumber,
  sellerName: sellerNameProp,
  customerName: customerNameProp,
  currentRole = 'customer',
  isOpen,
  onClose,
}: OrderChatModalProps) {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const t = useT(ordersMessages);
  const sellerName = sellerNameProp ?? t('chat.homeKitchen');
  const customerName = customerNameProp ?? t('chat.customer');

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isSellerRole = currentRole === 'seller';
  const targetName = isSellerRole ? customerName || t('chat.customer') : sellerName || t('chat.homeKitchen');
  const primaryThemeColor = isSellerRole ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#FF5500] hover:bg-[#e04400]';
  const activeFocusRing = isSellerRole ? 'focus:ring-emerald-500' : 'focus:ring-[#FF5500]';

  // Quick Communication Template Chips
  const quickChips = isSellerRole
    ? [
        t('chat.chip.seller1'),
        t('chat.chip.seller2'),
        t('chat.chip.seller3'),
        t('chat.chip.seller4'),
      ]
    : [
        t('chat.chip.customer1'),
        t('chat.chip.customer2'),
        t('chat.chip.customer3'),
        t('chat.chip.customer4'),
      ];

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const loadMessages = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await orderService.getOrderMessages(orderId, currentRole);
        if (res.data) {
          setMessages(res.data);
        }
      } catch (err) {
        console.error('Failed to load order messages:', err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [orderId, currentRole]
  );

  useEffect(() => {
    if (!isOpen) return;
    loadMessages();
  }, [isOpen, loadMessages]);

  // New messages and read receipts arrive as live events while the chat is open.
  useLiveRefresh(() => loadMessages(true), {
    events: ['order:message', 'order:messages:read'],
    match: (data) => data?.orderId === orderId,
    intervalMs: 30_000,
    offlineMs: 5_000,
    enabled: isOpen,
  });

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // Clean up recording on unmount or close
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Send Text Message
  const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (customText !== undefined ? customText : newMessage).trim();
    if (!textToSend || sending) return;

    setSending(true);
    try {
      const res = await orderService.sendOrderMessage(orderId, textToSend, {
        role: currentRole,
        messageType: 'text',
      });
      if (res.data) {
        setMessages((prev) => [...prev, { ...res.data, isMe: true }]);
        if (customText === undefined) setNewMessage('');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || t('chat.sendFailed');
      showToast(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  // Start Voice Recording
  const startRecording = async () => {
    if (typeof window === 'undefined') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      showToast(t('chat.micDenied'), 'error');
    }
  };

  // Cancel Voice Recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  // Stop & Send Voice Note
  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current) return;
    const duration = recordingSeconds;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());

      // Upload the recording as a private file (only this order's participants can
      // play it), then send the message that points at it.
      setSending(true);
      try {
        const form = new FormData();
        form.append('file', audioBlob, 'voice-note.webm');
        const upload = await apiClient.post('/upload/chat-media', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const ref = upload.data?.data?.ref;
        if (!ref) throw new Error('Upload failed');
        const res = await orderService.sendOrderMessage(orderId, '🎙️ Voice note', {
          role: currentRole,
          messageType: 'voice',
          mediaUrl: ref,
          duration: Math.max(1, duration),
        });
        if (res.data) {
          setMessages((prev) => [...prev, { ...res.data, isMe: true }]);
        }
      } catch (err: any) {
        showToast(err.response?.data?.error?.message || t('chat.voiceFailed'), 'error');
      } finally {
        setSending(false);
      }
    };

    mediaRecorderRef.current.stop();
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 md:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[640px] max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0C1016] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl ${
                isSellerRole ? 'bg-emerald-600' : 'bg-[#FF5500]'
              } text-white flex items-center justify-center font-black text-sm shadow-md shrink-0`}
            >
              💬
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-white truncate max-w-[200px] md:max-w-[260px]">
                  {t('chat.chatWith', { name: targetName })}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-white/10 text-slate-300" data-ltr>
                  #{orderNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {isSellerRole
                  ? t('chat.subtitleSeller')
                  : t('chat.subtitleCustomer')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('chat.close')}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Safety / Community Notice */}
        <div
          className={`px-4 py-2 border-b flex items-center gap-2 text-[11px] font-medium ${
            isSellerRole
              ? 'bg-emerald-50/80 border-emerald-100 text-emerald-950'
              : 'bg-orange-50/80 border-orange-100 text-orange-950'
          }`}
        >
          <ShieldCheck
            className={`w-3.5 h-3.5 flex-shrink-0 ${isSellerRole ? 'text-emerald-600' : 'text-[#FF5500]'}`}
          />
          <span className="truncate">
            {isSellerRole
              ? t('chat.noticeSeller')
              : t('chat.noticeCustomer')}
          </span>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-3 py-2 bg-slate-100/70 border-b border-slate-200/60 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 ps-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            {t('chat.quick')}
          </span>
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(undefined, chip)}
              disabled={sending}
              className="text-[11px] font-semibold bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 px-2.5 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs hover:border-slate-300 active:scale-95 disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <div
                className={`w-6 h-6 border-2 ${
                  isSellerRole ? 'border-emerald-600' : 'border-[#FF5500]'
                } border-t-transparent rounded-full animate-spin`}
              />
              <span className="text-xs font-bold">{t('chat.loading')}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-xl mb-2 shadow-xs">
                {isSellerRole ? '👤' : '👩‍🍳'}
              </div>
              <p className="text-xs font-extrabold text-slate-700">{t('chat.empty')}</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                {isSellerRole
                  ? t('chat.emptySeller', { name: targetName })
                  : t('chat.emptyCustomer', { name: targetName })}
              </p>
            </div>
          ) : (
            messages.map((msg: any) => {
              // Crucial role separation fix:
              // A message belongs on the right (isMe) ONLY if its senderRole matches the current modal role perspective!
              const isMe = msg.senderRole === currentRole;

              let senderLabel = '';
              if (isMe) {
                senderLabel = isSellerRole ? t('chat.youKitchen') : t('chat.youCustomer');
              } else if (msg.senderRole === 'customer') {
                senderLabel = `👤 ${customerName || t('chat.customer')}`;
              } else if (msg.senderRole === 'seller') {
                senderLabel = `👩‍🍳 ${sellerName || t('chat.kitchen')}`;
              } else {
                senderLabel = t('chat.deliveryRider');
              }

              const isVoiceNote = msg.messageType === 'voice' || (msg.mediaUrl && msg.mediaUrl.startsWith('data:audio'));

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Sender Name & Time */}
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-extrabold text-slate-400">{senderLabel}</span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[85%] rounded-2xl p-2.5 text-xs font-medium leading-relaxed shadow-xs ${
                      isMe
                        ? isSellerRole
                          ? 'bg-emerald-600 text-white rounded-se-xs'
                          : 'bg-[#FF5500] text-white rounded-se-xs'
                        : 'bg-white text-slate-900 border border-slate-200/80 rounded-ss-xs'
                    }`}
                  >
                    {isVoiceNote && msg.mediaUrl ? (
                      <VoiceNotePlayer
                        mediaUrl={msg.mediaUrl}
                        duration={msg.duration}
                        isMeBubble={isMe}
                      />
                    ) : (
                      <div className="px-1.5 py-0.5">{msg.message}</div>
                    )}

                    {/* Delivery & Read Double Ticks for Sent Messages */}
                    {isMe && (
                      <div className="flex items-center justify-end pt-1 pe-1">
                        <StatusTicks isRead={Boolean(msg.isRead)} isMeBubble={isMe} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar or Voice Recording Bar */}
        {isRecording ? (
          /* Active Voice Recording UI */
          <div className="p-3 bg-red-50/80 border-t border-red-200 flex items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600"></span>
              </span>
              <span className="text-xs font-black text-red-700 font-mono tracking-wider">
                {t('chat.recording', {
                  time: `${Math.floor(recordingSeconds / 60)}:${recordingSeconds % 60 < 10 ? '0' : ''}${recordingSeconds % 60}`,
                })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Cancel Button */}
              <button
                onClick={cancelRecording}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-red-100 text-red-600 text-xs font-bold border border-red-200 transition-colors shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('chat.cancel')}</span>
              </button>

              {/* Send Voice Note Button */}
              <button
                onClick={stopAndSendRecording}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black transition-colors shadow-md active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('chat.sendVoice')}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard Input Bar */
          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            {/* Voice Record Trigger */}
            <button
              type="button"
              onClick={startRecording}
              disabled={sending}
              className="w-11 h-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shadow-2xs shrink-0 active:scale-95 disabled:opacity-40"
              title={t('chat.recordVoice')}
            >
              <Mic className="w-5 h-5 text-slate-600" />
            </button>

            {/* Text Input */}
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={
                isSellerRole
                  ? t('chat.placeholderSeller', { name: targetName })
                  : t('chat.placeholderCustomer', { name: targetName })
              }
              className={`flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 ${activeFocusRing} focus:border-transparent bg-slate-50 focus:bg-white transition-all`}
              disabled={sending}
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className={`w-11 h-11 rounded-2xl ${primaryThemeColor} disabled:opacity-40 text-white flex items-center justify-center transition-colors shadow-md shrink-0 active:scale-95`}
              title={t('chat.send')}
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
