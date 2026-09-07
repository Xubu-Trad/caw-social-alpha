// Local preview policy only. This is neither an upload nor a malware/codec audit.
export const MEDIA_LIMITS=Object.freeze({imageBytes:4*1024*1024,videoBytes:16*1024*1024,imageEdge:4096,imagePixels:16000000,videoPixels:1920*1080,videoEdge:1920,videoSeconds:60});
const ascii=(bytes,start,length)=>String.fromCharCode(...bytes.subarray(start,start+length));
const is=(bytes,values)=>values.every((value,index)=>bytes[index]===value);
function imageSize(bytes,mime){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(mime==='image/png' && bytes.length>=24 && ascii(bytes,12,4)==='IHDR')return [view.getUint32(16),view.getUint32(20)];
  if(mime==='image/webp' && bytes.length>=30){
    const chunk=ascii(bytes,12,4);
    const little24=index=>bytes[index]+bytes[index+1]*256+bytes[index+2]*65536;
    if(chunk==='VP8X')return [1+little24(24),1+little24(27)];
    if(chunk==='VP8L' && bytes[20]===0x2f){const word=view.getUint32(21,true);return [1+(word&0x3fff),1+((word>>>14)&0x3fff)];}
    if(chunk==='VP8 ' && is(bytes.subarray(23),[0x9d,0x01,0x2a]))return [view.getUint16(26,true)&0x3fff,view.getUint16(28,true)&0x3fff];
  }
  if(mime==='image/jpeg'){
    const frames=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    let offset=2;
    while(offset+3<bytes.length){
      if(bytes[offset++]!==0xff)break;
      while(bytes[offset]===0xff)offset++;
      const marker=bytes[offset++];
      if(marker===0xd9 || marker===0xda)break;
      if(marker===0x01 || marker>=0xd0 && marker<=0xd7)continue;
      if(offset+2>bytes.length)break;
      const length=view.getUint16(offset);
      if(length<2 || offset+length>bytes.length)break;
      if(frames.has(marker) && length>=7)return [view.getUint16(offset+5),view.getUint16(offset+3)];
      offset+=length;
    }
  }
  throw new Error('Image dimensions could not be checked within the bounded header. Choose another image.');
}
export async function inspectMedia(file){
  if(!file || typeof file.slice!=='function' || !Number.isSafeInteger(file.size) || file.size<=0)throw new Error('Choose one non-empty image or video.');
  if(file.size>MEDIA_LIMITS.videoBytes)throw new Error('Video previews are limited to 16 MiB; images to 4 MiB.');
  const bytes=new Uint8Array(await file.slice(0,65536).arrayBuffer());
  let mime;
  if(is(bytes,[137,80,78,71,13,10,26,10]))mime='image/png';
  else if(is(bytes,[0xff,0xd8,0xff]))mime='image/jpeg';
  else if(ascii(bytes,0,4)==='RIFF' && ascii(bytes,8,4)==='WEBP')mime='image/webp';
  else if(bytes.length>=12 && ascii(bytes,4,4)==='ftyp')mime='video/mp4';
  else if(is(bytes,[0x1a,0x45,0xdf,0xa3]))mime='video/webm';
  else throw new Error('Preview supports PNG, JPEG, WebP, MP4 and WebM headers only. SVG and other active formats are excluded.');
  if(file.type && file.type!==mime)throw new Error('The file label and detected header disagree. Preview was not opened.');
  const kind=mime.startsWith('image/')?'image':'video';
  if(kind==='image'){
    if(file.size>MEDIA_LIMITS.imageBytes)throw new Error('Image previews are limited to 4 MiB.');
    const [width,height]=imageSize(bytes,mime);
    if(!width || !height || width>MEDIA_LIMITS.imageEdge || height>MEDIA_LIMITS.imageEdge || width*height>MEDIA_LIMITS.imagePixels)throw new Error('Image previews allow up to 4096 pixels per edge and 16 megapixels.');
    return {kind,mime,bytes:file.size,width,height};
  }
  return {kind,mime,bytes:file.size};
}
export function validateVideoMetadata(duration,width,height){
  if(!Number.isFinite(duration) || duration<=0 || duration>MEDIA_LIMITS.videoSeconds)throw new Error('Video previews allow up to 60 seconds.');
  if(!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width<=0 || height<=0 || width>MEDIA_LIMITS.videoEdge || height>MEDIA_LIMITS.videoEdge || width*height>MEDIA_LIMITS.videoPixels)throw new Error('Video previews allow up to 1920 pixels per edge and 1920 × 1080 total pixels.');
}
