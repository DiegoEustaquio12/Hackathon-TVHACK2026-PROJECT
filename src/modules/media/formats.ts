import { AudioError } from './audio';
export type MediaKind = 'audio' | 'image';
const aliases: Record<string,string> = { 'audio/mp3':'audio/mpeg','audio/x-m4a':'audio/mp4',
  'audio/x-wav':'audio/wav','audio/x-flac':'audio/flac' };
export function canonicalMime(mime: string) {
  const value=mime.split(';')[0].trim().toLowerCase();
  return aliases[value] ?? value;
}
/** Container signatures, not a full decoder or codec validator. */
export function validateMediaContent(kind: MediaKind, mime: string, bytes: Uint8Array) {
  const type=canonicalMime(mime);
  const at=(offset:number,text:string)=>Buffer.from(bytes.subarray(offset,offset+text.length)).toString('latin1')===text;
  const signatures:Record<string,boolean>={
    'audio/ogg':at(0,'OggS'), 'audio/flac':at(0,'fLaC'),
    'audio/wav':at(0,'RIFF')&&at(8,'WAVE'), 'audio/mp4':at(4,'ftyp'),
    'audio/webm':bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3,
    'audio/mpeg':at(0,'ID3')||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0),
    'image/jpeg':bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff,
    'image/png':at(0,'\x89PNG\r\n\x1a\n'), 'image/webp':at(0,'RIFF')&&at(8,'WEBP'),
  };
  if(!type.startsWith(`${kind}/`)||!signatures[type]) throw new AudioError('INVALID_AUDIO');
  return type;
}
