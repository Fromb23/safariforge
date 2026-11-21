import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileTypeFromFile } from "file-type";
import { config } from "./config";
import { db } from "./db";

const allowed = new Map([["image/jpeg",".jpg"],["image/png",".png"],["image/webp",".webp"]]);
export function storagePath(key: string) { if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) throw new Error("Invalid storage key."); const value=path.resolve(config.mediaDir,key); if(path.dirname(value)!==config.mediaDir) throw new Error("Invalid storage path."); return value; }
export async function importImage(filePath: string, originalName: string, tags: string[], altText: string) {
  await fsp.mkdir(config.mediaDir,{recursive:true}); const size=(await fsp.stat(filePath)).size; if(size>config.maxImageBytes) throw new Error(`${originalName} exceeds MAX_IMAGE_BYTES.`);
  const hash=createHash("sha256"); await new Promise<void>((resolve,reject)=>{const stream=fs.createReadStream(filePath);stream.on("data",(chunk)=>hash.update(chunk));stream.on("end",resolve);stream.on("error",reject)}); const sha256=hash.digest("hex");
  const duplicate=db().prepare("SELECT id FROM media WHERE original_name=? AND sha256=?").get(originalName,sha256) as {id:string}|undefined; if(duplicate)return{ id:duplicate.id,duplicate:true };
  const detected=await fileTypeFromFile(filePath); if(!detected||!allowed.has(detected.mime))throw new Error(`${originalName} is not a supported image.`);
  const metadata=await sharp(filePath,{limitInputPixels:50_000_000,failOn:"warning"}).metadata(); if(!metadata.width||!metadata.height)throw new Error(`${originalName} has invalid dimensions.`);
  const id=randomUUID(); const storageKey=`${randomUUID()}${allowed.get(detected.mime)}`; const thumbnailKey=`${randomUUID()}.webp`;
  await fsp.copyFile(filePath,storagePath(storageKey)); await sharp(filePath,{limitInputPixels:50_000_000}).rotate().resize(900,900,{fit:"inside",withoutEnlargement:true}).webp({quality:80}).toFile(storagePath(thumbnailKey));
  db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,storageKey,thumbnailKey,originalName,detected.mime,size,sha256,metadata.width,metadata.height,JSON.stringify(tags),altText,new Date().toISOString());
  return{id,duplicate:false};
}
export async function persistUpload(body: ReadableStream<Uint8Array>|null, originalName:string, tags:string[], altText:string) {
  if(!body)throw new Error("No upload body."); await fsp.mkdir(config.mediaDir,{recursive:true}); const temp=path.join(config.mediaDir,`${randomUUID()}.tmp`); const reader=body.getReader(); let total=0; const handle=await fsp.open(temp,"wx");
  try { while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>config.maxImageBytes)throw new Error("Image exceeds MAX_IMAGE_BYTES.");await handle.write(value);} } finally {await handle.close();}
  try{return await importImage(temp,originalName,tags,altText);}finally{await fsp.rm(temp,{force:true});}
}
