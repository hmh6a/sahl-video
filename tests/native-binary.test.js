const {test}=require('node:test'),assert=require('node:assert/strict');
const {windowsImports}=require('../scripts/verify-package.cjs');
function pe(name='KERNEL32.dll'){
 const b=Buffer.alloc(1024),header=0x80,optional=header+24,sections=optional+240;
 b.writeUInt32LE(header,0x3c);b.write('PE\0\0',header,'ascii');b.writeUInt16LE(0x8664,header+4);b.writeUInt16LE(1,header+6);b.writeUInt16LE(240,header+20);b.writeUInt16LE(0x20b,optional);b.writeUInt32LE(0x1000,optional+120);
 b.writeUInt32LE(0x1000,sections+12);b.writeUInt32LE(512,sections+16);b.writeUInt32LE(512,sections+20);b.writeUInt32LE(0x1080,512+12);b.write(name,640,'ascii');return b;
}
test('package verifier reads x64 PE imports and rejects wrong architecture or invalid addresses',()=>{
 assert.deepEqual(windowsImports(pe()),['KERNEL32.dll']);assert.deepEqual(windowsImports(pe('VCRUNTIME140.dll')),['VCRUNTIME140.dll']);
 const wrong=pe();wrong.writeUInt16LE(0x14c,0x84);assert.throws(()=>windowsImports(wrong),/x64/);
 const bad=pe();bad.writeUInt32LE(0x9000,524);assert.throws(()=>windowsImports(bad),/import address/);assert.throws(()=>windowsImports(Buffer.alloc(10)));
});
