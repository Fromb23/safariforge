import "dotenv/config";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import unzipper from "unzipper";
import { config } from "../src/lib/config";
import { importImage } from "../src/lib/storage";

function words(filename: string) {
  return path.basename(filename,path.extname(filename)).replace(/[_().0-9]+/g," ").replace(/\s+/g," ").trim();
}
function initialTags(filename: string) {
  const value=filename.toLowerCase(); const tags=["tanzania","safari"];
  for(const [needle,tag] of [["ngorongoro","ngorongoro"],["serengeti","serengeti"],["tarangire","tarangire"],["lion","lion"],["elephant","elephant"],["gazelle","gazelle"],["buff","buffalo"],["wilder","wildebeest"],["wilde","wildebeest"],["zebra","zebra"],["girr","giraffe"],["cheetah","cheetah"],["hyena","hyena"],["hippo","hippo"],["warthog","warthog"],["balloon","balloon safari"],["night","night drive"],["game drive","game drive"],["plain","landscape"],["view","landscape"],["baobab","baobab"]] as const) if(value.includes(needle))tags.push(tag);
  return [...new Set(tags)];
}
if(!fs.existsSync(config.sourceArchive))throw new Error(`Source archive not found: ${config.sourceArchive}`);
const tempDir=path.join(path.dirname(config.databasePath),`import-${randomUUID()}`); await fsp.mkdir(tempDir,{recursive:true});
let found=0,created=0,duplicates=0;
try {
  const directory=await unzipper.Open.file(config.sourceArchive);
  for(const entry of directory.files.filter((item)=>item.type==="File"&&!item.path.startsWith("__MACOSX/"))){
    found++; const originalName=path.basename(entry.path); const tempPath=path.join(tempDir,`${found}-${originalName.replace(/[^a-zA-Z0-9.-]/g,"_")}`);
    await new Promise<void>((resolve,reject)=>entry.stream().pipe(fs.createWriteStream(tempPath,{flags:"wx"})).on("finish",resolve).on("error",reject));
    const result=await importImage(tempPath,originalName,initialTags(originalName),`${words(originalName)} in Tanzania`); if(result.duplicate)duplicates++;else created++;
  }
} finally {try{await fsp.rm(tempDir,{recursive:true,force:true,maxRetries:8,retryDelay:250});}catch(error){if((error as NodeJS.ErrnoException).code!=="EBUSY")throw error;console.warn("A temporary import file is still locked by Windows and will remain under runtime; the media import itself completed safely.");}}
if(found!==43)throw new Error(`Expected 43 source images, found ${found}.`);
console.log(`Image import complete: ${found} originals checked, ${created} records created, ${duplicates} already present.`);
