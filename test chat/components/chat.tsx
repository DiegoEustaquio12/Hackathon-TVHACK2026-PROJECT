"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { audioMimeTypes, chatInputSchema, historySchema, imageMimeTypes, MAX_MEDIA_BYTES, sendMessageResponseSchema, type ChatInput, type ChatMessage } from "@/src/contracts/chat";
import { api, errorMessage, jsonRequest } from "./api-client";
import { Icon } from "./icon";
import { BrandLogo } from "./brand-logo";
import Link from "next/link";
import styles from "./chat.module.css";

const time = (value: string) => new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
type Attachment = { name: string; data_url: string };

export function Chat({ mock, local = false }: { mock: boolean; local?: boolean }) {
  const [tray, setTray] = useState(false);
  const [info, setInfo] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [kind, setKind] = useState<"text" | "audio" | "image">("text");
  const [text, setText] = useState(""); const [alt, setAlt] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false); const [recording, setRecording] = useState(false);
  const [error, setError] = useState(""); const [status, setStatus] = useState("");
  const [canRecord, setCanRecord] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null); const list = useRef<HTMLDivElement>(null);
  const pending = useRef<{ serialized: string; id: string } | null>(null);
  const selection = useRef(0); const mounted = useRef(true);

  async function load() {
    setLoading(true); setError("");
    try { const history = await api("/api/chat/messages", historySchema); setMessages(history.messages); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    setCanRecord(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    void load();
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(t => t.stop());
    };
  }, []);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages, busy]);

  async function selectFile(file?: File, selectedKind = kind) {
    const current = ++selection.current;
    setAttachment(null); setError(""); setStatus("");
    if (!file) return;
    const accepted: readonly string[] = selectedKind === "image" ? imageMimeTypes : audioMimeTypes;
    if (!accepted.includes(file.type) || file.size === 0 || file.size > MAX_MEDIA_BYTES) {
      setError("Elige un archivo válido de hasta 2 MB en uno de los formatos indicados."); if (fileInput.current) fileInput.current.value = ""; return;
    }
    setReading(true);
    try {
      const data_url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No pudimos leer el archivo. Selecciónalo de nuevo.")); reader.readAsDataURL(file);
      });
      if (current === selection.current && mounted.current) { setAttachment({ name: file.name.slice(0,120), data_url }); setStatus(`Archivo listo: ${file.name}`); }
    } catch (e) { if (current === selection.current) setError(errorMessage(e)); }
    finally { if (current === selection.current) setReading(false); }
  }
  function changeKind(value: typeof kind) {
    selection.current++; setKind(value); setAttachment(null); setAlt(""); setError(""); setStatus(""); setReading(false);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function startRecording() {
    changeKind("audio"); setTray(true); setError(""); setReading(true); setAttachment(null);
    try {
      const tracks = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { tracks.getTracks().forEach(t => t.stop()); return; }
      stream.current = tracks;
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Este navegador no admite la grabación. Puedes cargar un archivo de audio.");
      const media = new MediaRecorder(tracks, { mimeType }); recorder.current = media;
      const chunks: BlobPart[] = []; let size = 0; let tooLarge = false;
      const stopTracks = () => { tracks.getTracks().forEach(t => t.stop()); if (timer.current) clearTimeout(timer.current); };
      media.ondataavailable = event => { size += event.data.size; chunks.push(event.data); if (size > MAX_MEDIA_BYTES && media.state === "recording") { tooLarge = true; media.stop(); } };
      media.onerror = () => { stopTracks(); if (mounted.current) { setError("La grabación falló. Puedes cargar un archivo de audio."); setReading(false); setRecording(false); } };
      media.onstop = () => {
        stopTracks(); recorder.current = null;
        if (!mounted.current) return;
        setRecording(false); setReading(false);
        if (tooLarge || size > MAX_MEDIA_BYTES) { setError("La grabación supera 2 MB. Graba un audio más corto."); return; }
        void selectFile(new File(chunks, `grabacion.${mimeType.split("/")[1]}`, { type: mimeType }), "audio");
      };
      media.start(500); setRecording(true); setStatus("Grabando. Detén la grabación cuando termines; el límite es un minuto.");
      timer.current = setTimeout(() => { if (media.state === "recording") media.stop(); }, 60_000);
    } catch (e) { stream.current?.getTracks().forEach(t => t.stop()); setError(errorMessage(e)); }
    finally { setReading(false); }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setStatus("");
    const serialized = JSON.stringify({ kind, text, alt, attachment });
    const id = pending.current?.serialized === serialized ? pending.current.id : crypto.randomUUID();
    pending.current = { serialized, id };
    const value = kind === "text" ? { kind, text, clientMessageId: id }
      : { kind, text: text || undefined, ...attachment, ...(kind === "image" ? { alt } : {}), clientMessageId: id };
    const parsed = chatInputSchema.safeParse(value);
    if (!parsed.success) { setError(kind === "text" ? "Escribe un mensaje de hasta 2,000 caracteres." : "Selecciona un archivo válido y, para la imagen, escribe su descripción."); return; }
    setBusy(true);
    try {
      const result = await api("/api/chat/messages", sendMessageResponseSchema, jsonRequest("POST", parsed.data));
      setMessages(current => [...current.filter(m => !result.messages.some(next => next.id === m.id)), ...result.messages].slice(-20));
      setText(""); setAttachment(null); setAlt(""); pending.current = null;
      if (fileInput.current) fileInput.current.value = "";
      setTray(false); setKind("text"); setStatus("Mensaje enviado. Hay una nueva respuesta del asistente.");
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const disabled = loading || busy || recording || reading;
  return <main id="main-content" className={styles.screen}>
    <div className={styles.phone}>
      <header className={styles.conversationHeader}>
        <Link href="/distribuidores" className={styles.back} aria-label="Volver al espacio de trabajo"><ChatIcon name="back" /></Link>
        <div className={styles.contact}>
          <button type="button" className={styles.avatar} onClick={() => setInfo(!info)} aria-expanded={info} aria-label="Información de Knectan"><BrandLogo compact /></button>
          <div><h1 className={styles.name}>Knectan <span className={styles.brandMark} role="img" aria-label="Asistente del proyecto"><ChatIcon name="check" /></span></h1><span className={styles.subtitle}>{local ? "Tu asistente · En este equipo" : mock ? "Cuenta de demostración" : "Asistente de tu comercio"}</span></div>
        </div>
        <button type="button" className={styles.iconButton} aria-label="Información del chat" onClick={() => setInfo(!info)} aria-expanded={info}><ChatIcon name="more" /></button>
      </header>
      {info && <section className={styles.info} aria-label="Acerca de este chat"><h2>Tu chat con Knectan</h2><p>{local ? "Respaldo local sin WhatsApp. Guarda mensajes, ventas y gastos confirmados en este equipo. Catálogo de prueba: Coca-Cola 600 ml y pan dulce. El registro usa la hora de Ciudad de México." : mock ? "Modo demostración: las respuestas son simuladas y no registran operaciones reales." : "El historial está asociado a tu sesión del comercio."}</p><p>Fotos y audios de hasta 2 MB. La grabación requiere permiso del micrófono. No se usa el servicio de Meta.</p><button type="button" onClick={() => setInfo(false)}>Cerrar información</button></section>}
      <div className={styles.messages} ref={list} role="log" aria-label="Historial de conversación" aria-live="polite" aria-relevant="additions" aria-busy={loading} tabIndex={0}>
        {messages.length === 0 && <div className={styles.day}>Hoy</div>}
        <p className={styles.localNotice}><ChatIcon name="lock" />{local ? "Este chat funciona sin WhatsApp. Los datos se guardan en este equipo." : mock ? "Chat de demostración. Las respuestas y operaciones son simuladas." : "Un espacio para conversar con tu comercio."}</p>
        {loading ? <p className={styles.loading} role="status">Cargando conversación…</p> : messages.length === 0 ? <div className={`${styles.message} ${styles.welcome}`}><p>Hola, soy <b>Knectan</b>.</p><p>{local ? "Tu comercio sigue conectado, incluso sin WhatsApp. Puedes registrar ventas, gastos y consultar tu día desde aquí." : "Aquí puedes escribir, compartir una foto o enviar una nota de voz."}</p><p>{local ? "Escribe «ayuda» para empezar." : "¿En qué te ayudo hoy?"}</p><time>{time(new Date().toISOString())}</time></div>
          : messages.map((message, index) => <div className={styles.messageGroup} key={message.id}>
            {(index === 0 || new Date(messages[index - 1].created_at).toDateString() !== new Date(message.created_at).toDateString()) && <div className={styles.date}>{new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" }).format(new Date(message.created_at))}</div>}
            <article className={styles.message} data-role={message.role} aria-label={message.role === "user" ? "Mensaje tuyo" : "Mensaje de Knectan"}><MessageContent content={message.content} /><span className={styles.messageMeta}><time dateTime={message.created_at}>{time(message.created_at)}</time>{message.role === "user" && <span role="img" aria-label="Enviado" className={styles.ticks}><ChatIcon name="doubleCheck" /></span>}</span></article>
          </div>)}
        {busy && <div className={styles.typing} role="status">Knectan está escribiendo<span>…</span></div>}
      </div>
      <form className={styles.composer} onSubmit={send} aria-busy={busy}>
        {tray && <div className={styles.attachmentPanel}>
          <div className={styles.panelHeading}><span>Adjuntar al chat</span><button type="button" className={styles.iconButton} aria-label="Cerrar adjuntos" disabled={recording} onClick={() => { setTray(false); changeKind("text"); }}><ChatIcon name="close" /></button></div>
          <fieldset className={styles.types} disabled={disabled}><legend className="sr-only">Tipo de mensaje</legend>{(["text", "audio", "image"] as const).map(value => <label key={value}><input type="radio" name="kind" value={value} checked={kind === value} onChange={() => changeKind(value)} />{value === "text" ? "Texto" : value === "audio" ? "Audio" : "Imagen"}</label>)}</fieldset>
          {kind !== "text" && <>
            <label className={styles.fileLabel} htmlFor="media">{kind === "image" ? "Archivo de imagen" : "Archivo de audio"}<small>{kind === "image" ? "JPG, PNG o WebP" : "WebM, Ogg, MP3, MP4 o WAV"} · Máximo 2 MB</small></label><input ref={fileInput} id="media" type="file" accept={(kind === "image" ? imageMimeTypes : audioMimeTypes).join(",")} disabled={disabled} onChange={event => void selectFile(event.target.files?.[0])} />
            {kind === "audio" && canRecord && <button type="button" className={styles.record} disabled={loading || busy || reading} onClick={() => recording ? recorder.current?.stop() : void startRecording()}><Icon name="mic" />{recording ? "Detener grabación" : "Grabar audio"}</button>}
            {attachment && (kind === "image" ? <><label htmlFor="alt">Descripción de la imagen (obligatoria)</label><input id="alt" value={alt} maxLength={240} required disabled={disabled} onChange={e => setAlt(e.target.value)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.preview} src={attachment.data_url} alt={alt || "Vista previa de la imagen seleccionada"} /></> : <audio controls src={attachment.data_url} aria-label="Vista previa del audio seleccionado" />)}
          </>}
        </div>}
        {emojis && <div className={styles.emojiPicker} role="group" aria-label="Elegir emoji">{["😊", "👍", "❤️", "🙌", "🎉", "✅", "👋", "🙏"].map(emoji => <button key={emoji} type="button" aria-label={`Añadir ${emoji}`} onClick={() => { setText(t => t + emoji); setEmojis(false); document.getElementById("message")?.focus(); }}>{emoji}</button>)}</div>} {/* taste-skill-ignore: selector de emojis solicitado para el chat de referencia. */}
        {error && <div id="chat-error" className={styles.error} role="alert">{error}{!loading && messages.length === 0 && <button type="button" onClick={() => void load()}>Recargar conversación</button>}</div>}
        {recording && <p className={styles.recording} role="status">Grabando audio · Máximo 1 minuto <button type="button" onClick={() => recorder.current?.stop()}>Detener</button></p>}
        <div className={styles.composerRow}>
          <button type="button" className={styles.iconButton} onClick={() => { setTray(!tray); setEmojis(false); }} disabled={disabled} aria-label="Adjuntar archivo" aria-expanded={tray}><ChatIcon name="plus" /></button>
          <div className={styles.inputWrap}><label className="sr-only" htmlFor="message">Tu mensaje</label><textarea id="message" rows={1} value={text} onChange={e => setText(e.target.value)} required={kind === "text"} maxLength={2000} disabled={disabled} aria-describedby={error ? "chat-error" : undefined} placeholder="Mensaje" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><button type="button" className={styles.iconButton} aria-label="Elegir emoji" aria-expanded={emojis} disabled={disabled} onClick={() => { setEmojis(!emojis); setTray(false); }}><ChatIcon name="smile" /></button></div>
          <button type="button" className={`${styles.iconButton} ${styles.camera}`} disabled={disabled} aria-label="Adjuntar foto" onClick={() => { changeKind("image"); setTray(true); setEmojis(false); }}><ChatIcon name="camera" /></button>
          {text.trim() || attachment || !canRecord ? <button className={styles.send} disabled={disabled} type="submit" aria-label="Enviar mensaje"><Icon name="send" /></button> : <button type="button" className={styles.send} disabled={loading || busy || reading} aria-label={recording ? "Detener grabación" : "Grabar nota de voz"} onClick={() => recording ? recorder.current?.stop() : void startRecording()}><Icon name="mic" /></button>}
        </div>
        <p className="sr-only" role="status" aria-live="polite">{status}</p>
        <div className={styles.homeIndicator} />
      </form>
    </div>
  </main>;
}
const chatPaths = {
  doubleCheck: "m1 12 4 4L15 6M10 15l2 2L23 6", back: "m15 5-7 7 7 7", plus: "M12 4v16M4 12h16", camera: "M4 7h3l2-3h6l2 3h3v13H4z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0", smile: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 14s1.5 3 4 3 4-3 4-3M8 9h.01M16 9h.01", more: "M12 5h.01M12 12h.01M12 19h.01", close: "m6 6 12 12M6 18 18 6", lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4", check: "m7 12 3 3 7-7",
};
function ChatIcon({ name }: { name: keyof typeof chatPaths }) { return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={chatPaths[name]} /></svg>; }

function MessageContent({ content }: { content: ChatInput }) {
  return <>{content.kind === "image" && <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={content.data_url} alt={content.alt} />
  </>}{content.kind === "audio" && <audio controls src={content.data_url} aria-label={`Audio: ${content.name}`} />}{content.text && <p>{content.text}</p>}</>;
}
