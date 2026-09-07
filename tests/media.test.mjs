import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectMedia,validateVideoMetadata,MEDIA_LIMITS} from '../public/media.mjs';

test('real archive PNG dimensions and bytes are inspected without retaining its name',async()=>{
  const raw=await readFile(new URL('../public/caw-symbol.png',import.meta.url));
  const result=await inspectMedia(new File([raw],'private-name.png',{type:'image/png'}));
  assert.deepEqual(result,{kind:'image',mime:'image/png',bytes:1189938,width:800,height:800});
  assert.equal(JSON.stringify(result).includes('private-name'),false);
});
test('empty, mislabeled, active-format and oversized local files are refused',async()=>{
  await assert.rejects(inspectMedia(new Blob([])),/non-empty/);
  await assert.rejects(inspectMedia(new Blob(['<svg onload="alert(1)"/>'],{type:'image/svg+xml'})),/active formats/);
  const raw=await readFile(new URL('../public/caw-symbol.png',import.meta.url));
  await assert.rejects(inspectMedia(new Blob([raw],{type:'video/mp4'})),/disagree/);
  let read=false;
  await assert.rejects(inspectMedia({size:MEDIA_LIMITS.videoBytes+1,slice(){read=true;throw Error();}}),/16 MiB/);
  assert.equal(read,false);
  const largeImage=new Blob([raw,new Uint8Array(MEDIA_LIMITS.imageBytes)],{type:'image/png'});
  await assert.rejects(inspectMedia(largeImage),/4 MiB/);
});
test('oversized image dimensions and incomplete headers fail before image decoding',async()=>{
  const raw=await readFile(new URL('../public/caw-symbol.png',import.meta.url));
  const changed=Uint8Array.from(raw);new DataView(changed.buffer).setUint32(16,100000);
  await assert.rejects(inspectMedia(new Blob([changed],{type:'image/png'})),/4096/);
  await assert.rejects(inspectMedia(new Blob([raw.subarray(0,12)],{type:'image/png'})),/dimensions/);
  await assert.rejects(inspectMedia(new Blob([Uint8Array.from([0xff,0xd8,0xff,0xe1,0xff,0xff])],{type:'image/jpeg'})),/dimensions/);
});
test('video headers identify a candidate only; duration and resolution still need validation',async()=>{
  const mp4=Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109]);
  assert.equal((await inspectMedia(new Blob([mp4],{type:'video/mp4'}))).kind,'video');
  assert.equal((await inspectMedia(new Blob([Uint8Array.from([26,69,223,163,0])],{type:'video/webm'}))).mime,'video/webm');
  assert.doesNotThrow(()=>validateVideoMetadata(60,1920,1080));
  assert.doesNotThrow(()=>validateVideoMetadata(10,1080,1920));
  for(const duration of [0,NaN,Infinity,60.01])assert.throws(()=>validateVideoMetadata(duration,1920,1080),/60 seconds/);
  for(const [width,height] of [[0,1080],[1920,1920],[4096,1],[NaN,1080]])assert.throws(()=>validateVideoMetadata(10,width,height),/pixels/);
});
