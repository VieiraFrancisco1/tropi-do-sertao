// Lê o pacote único de fotos, enviado a assets/fotos-tropi-2026.zip.
import { inflateRawSync } from 'node:zlib';
export const REQUIRED_PHOTOS = Object.freeze([
  'salada.webp','ninho.webp','morango-creme.webp','maracuja.webp',
  'morango.webp','kiwi.webp','combo-tropi.webp','iogurte-morango.webp',
  'iogurte-natural.webp','sanduiche-natural.webp','suco-laranja.webp',
  'suco-maracuja.webp','suco-abacaxi-hortela.webp'
]);
const ALLOWED=new Set([...REQUIRED_PHOTOS,'combo-tropi-banner.webp']);
const webp=data=>data.length>16&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
export function unpackTropiPhotos(input){
 const zip=Buffer.from(input);
 if(zip.length>24*1024*1024)throw new Error('Pacote de fotos maior que 24 MB.');
 let end=-1;
 for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--){
  if(zip.readUInt32LE(i)===0x06054b50){end=i;break;}
 }
 if(end<0)throw new Error('Pacote de fotos nao e um ZIP valido.');
 const count=zip.readUInt16LE(end+10),central=zip.readUInt32LE(end+16);
 if(count<REQUIRED_PHOTOS.length||count>30||central>=zip.length)throw new Error('Quantidade de fotos invalida.');
 const photos=new Map();let offset=central;
 for(let i=0;i<count;i++){
  if(offset+46>zip.length||zip.readUInt32LE(offset)!==0x02014b50)throw new Error('Indice ZIP invalido.');
  const method=zip.readUInt16LE(offset+10),compressed=zip.readUInt32LE(offset+20),length=zip.readUInt32LE(offset+24);
  const n=zip.readUInt16LE(offset+28),e=zip.readUInt16LE(offset+30),c=zip.readUInt16LE(offset+32),local=zip.readUInt32LE(offset+42);
  if(offset+46+n+e+c>zip.length)throw new Error('Pacote ZIP incompleto.');
  const path=zip.subarray(offset+46,offset+46+n).toString('utf8');
  offset+=46+n+e+c;
  if(!path.startsWith('fotos/'))continue;
  const name=path.slice(6);
  if(!ALLOWED.has(name)||photos.has(name))throw new Error('Foto inesperada ou duplicada: '+path);
  if(length>5*1024*1024||![0,8].includes(method))throw new Error('Imagem grande demais ou metodo desconhecido.');
  if(local+30>zip.length||zip.readUInt32LE(local)!==0x04034b50)throw new Error('Cabeçalho ZIP invalido.');
  const begin=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);
  if(begin+compressed>zip.length)throw new Error('Imagem incompleta no pacote.');
  const payload=zip.subarray(begin,begin+compressed);
  const result=method===8?inflateRawSync(payload,{maxOutputLength:6*1024*1024}):payload;
  if(result.length!==length||!webp(result))throw new Error('Imagem WEBP invalida: '+name);
  photos.set(name,result);
 }
 for(const name of REQUIRED_PHOTOS)if(!photos.has(name))throw new Error('Foto obrigatoria ausente: '+name);
 return photos;
}