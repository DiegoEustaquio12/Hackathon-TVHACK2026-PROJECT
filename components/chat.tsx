"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { audioMimeTypes, chatInputSchema, historySchema, imageMimeTypes, MAX_MEDIA_BYTES, sendMessageResponseSchema, type ChatInput, type ChatMessage } from "@/src/contracts/chat";
import { api, errorMessage, jsonRequest } from "./api-client";
import { Icon } from "./icon";
import { BrandLogo } from "./brand-logo";
import ui from "./workspace.module.css";
import styles from "./chat.module.css";

const time = (value: string) => new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
type Attachment = { name: string; data_url: string };

export function Chat({ mock }: { mock: boolean }) {
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

  async function selectFile(file?: File) {
    const current = ++selection.current;
    setAttachment(null); setError(""); setStatus("");
    if (!file) return;
    const accepted: readonly string[] = kind === "image" ? imageMimeTypes : audioMimeTypes;
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
    setError(""); setReading(true); setAttachment(null);
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
        void selectFile(new File(chunks, `grabacion.${mimeType.split("/")[1]}`, { type: mimeType }));
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
      setStatus("Mensaje enviado. Hay una nueva respuesta del asistente.");
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const disabled = loading || busy || recording || reading;
  return <>
    <div className={ui.heading}><div><h1>Asistente para tu comercio</h1><p>Envía un mensaje, una foto o un audio desde un solo lugar.</p></div></div>
    <div className={styles.layout}>
      <section className={styles.conversation} aria-label="Conversación con el asistente">
        <header className={styles.conversationHeader}><BrandLogo compact /><div><h2>Asistente Knectan</h2><p>{mock ? "Respuestas simuladas · Sin operaciones reales" : "Conversación de tu comercio"}</p></div></header>
        <div className={styles.messages} ref={list} role="log" aria-label="Historial de conversación" aria-live="polite" aria-relevant="additions" aria-busy={loading} tabIndex={0}>
          {loading ? <p role="status">Cargando conversación…</p> : messages.length === 0 ? <div className={styles.welcome}><div className={styles.avatar}><Icon name="chat" /></div><h2>Tu próxima conversación empieza aquí</h2><p>Escribe lo que necesitas o adjunta un archivo. {mock && "Puedes recorrer el flujo con respuestas de demostración."}</p></div>
            : messages.map(message => <article className={styles.message} data-role={message.role} key={message.id}><strong>{message.role === "user" ? "Tú" : "Knectan"}</strong><MessageContent content={message.content} /><time dateTime={message.created_at}>{time(message.created_at)}</time></article>)}
          {busy && <p role="status">Enviando mensaje…</p>}
        </div>
        <form className={styles.composer} onSubmit={send} aria-busy={busy}>
          <fieldset className={styles.types} disabled={disabled}><legend>Tipo de mensaje</legend>{(["text", "audio", "image"] as const).map(value => <label key={value}><input type="radio" name="kind" value={value} checked={kind === value} onChange={() => changeKind(value)} />{value === "text" ? "Texto" : value === "audio" ? "Audio" : "Imagen"}</label>)}</fieldset>
          {kind !== "text" && <>
            <div className={ui.field}><label htmlFor="media">{kind === "image" ? "Archivo de imagen" : "Archivo de audio"}</label><input ref={fileInput} id="media" type="file" accept={(kind === "image" ? imageMimeTypes : audioMimeTypes).join(",")} disabled={disabled} onChange={event => void selectFile(event.target.files?.[0])} aria-describedby="media-help chat-error" /><small id="media-help" className={ui.notice}>{kind === "image" ? "JPG, PNG o WebP" : "WebM, Ogg, MP3, MP4 o WAV"} · Máximo 2 MB</small></div>
            {kind === "audio" && <div className={styles.record}>{canRecord && <button type="button" className={ui.button} disabled={loading || busy || reading} onClick={() => recording ? recorder.current?.stop() : void startRecording()}><Icon name="mic" />{recording ? "Detener grabación" : "Grabar audio"}</button>}<span className={ui.notice}>{canRecord ? "Hasta 1 minuto. Requiere permiso del micrófono." : "Puedes enviar audio desde un archivo."}</span></div>}
            {attachment && (kind === "image" ? <><div className={ui.field}><label htmlFor="alt">Descripción de la imagen (obligatoria)</label><input id="alt" value={alt} maxLength={240} required disabled={disabled} onChange={e => setAlt(e.target.value)} aria-describedby="chat-error" /></div>{/* User-selected data URLs are validated by the shared schema. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.preview} src={attachment.data_url} alt={alt || "Vista previa de la imagen seleccionada"} /></> : <audio controls src={attachment.data_url} aria-label="Vista previa del audio seleccionado" />)}
          </>}
          <div className={ui.field}><label htmlFor="message">{kind === "text" ? "Tu mensaje" : "Mensaje adicional (opcional)"}</label><textarea id="message" value={text} onChange={e => setText(e.target.value)} required={kind === "text"} maxLength={2000} disabled={disabled} aria-describedby="chat-error" placeholder="Por ejemplo: quiero revisar mis pedidos" /></div>
          <div id="chat-error" role="alert">{error && <div className={ui.error}>{error}{loading === false && messages.length === 0 && <button type="button" className={ui.button} onClick={() => void load()}>Recargar conversación</button>}</div>}</div>
          <p className="sr-only" role="status" aria-live="polite">{status}</p>
          <div className={styles.actions}><p>{mock ? "Demo temporal. Evita compartir datos personales." : "Revisa tu mensaje antes de enviarlo."}</p><button className={`${ui.button} ${ui.primary}`} disabled={disabled || (kind !== "text" && !attachment)} type="submit"><Icon name="send" />{busy ? "Enviando…" : "Enviar mensaje"}</button></div>
        </form>
      </section>
      <aside className={styles.guide}><h2>Tres formas de conversar</h2><h3>Escribe tu mensaje</h3><p>Cuenta qué necesitas con tus propias palabras.</p><h3>Comparte una imagen</h3><p>Carga una foto y añade una descripción para que sea accesible.</p><h3>Envía un audio</h3><p>Graba desde el navegador o elige un archivo de tu dispositivo.</p><p className={styles.hint}>{mock ? "Esta demo confirma la recepción de tus mensajes. No transcribe audios, analiza imágenes ni guarda operaciones reales." : "El historial está asociado a tu sesión."}</p></aside>
    </div>
  </>;
}
function MessageContent({ content }: { content: ChatInput }) {
  return <>{content.kind === "image" && <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={content.data_url} alt={content.alt} />
  </>}{content.kind === "audio" && <audio controls src={content.data_url} aria-label={`Audio: ${content.name}`} />}{content.text && <p>{content.text}</p>}</>;
}
