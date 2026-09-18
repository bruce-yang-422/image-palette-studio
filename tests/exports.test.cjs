const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('ASE and ACO independently decode to original RGB values and Unicode names',()=>{
  const scope=vm.createContext({window:{}});
  for(const file of ['utils/color-convert.js','core/export-engine.js']) vm.runInContext(readFileSync(path.join(__dirname,'../js',file),'utf8'),scope);
  const engine=scope.window.ExportEngine;
  const colors=['#123456','#00ff80','#ffffff'],names=['繁體中文','ไทย 😀','Español'];
  const expected=colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  const ase=Buffer.from(engine.buildAseBuffer(colors,names));
  assert.equal(ase.subarray(0,4).toString(),'ASEF');assert.equal(ase.readUInt16BE(4),1);assert.equal(ase.readUInt32BE(8),colors.length);
  let offset=12;
  const readName=(buffer,start,length)=>Array.from({length:length-1},(_,i)=>String.fromCharCode(buffer.readUInt16BE(start+2*i))).join('');
  for(let i=0;i<colors.length;i++) {
    assert.equal(ase.readUInt16BE(offset),1);
    const end=offset+6+ase.readUInt32BE(offset+2);offset+=6;
    const length=ase.readUInt16BE(offset);offset+=2;
    assert.equal(readName(ase,offset,length),names[i]);assert.equal(ase.readUInt16BE(offset+2*(length-1)),0);offset+=2*length;
    assert.equal(ase.subarray(offset,offset+4).toString(),'RGB ');offset+=4;
    for(const channel of expected[i]) {assert.ok(Math.abs(ase.readFloatBE(offset)-channel/255)<1e-7);offset+=4;}
    assert.equal(ase.readUInt16BE(offset),0);offset+=2;assert.equal(offset,end);
  }
  assert.equal(offset,ase.length);
  const aco=Buffer.from(engine.buildAcoBuffer(colors,names));offset=0;
  for(const version of [1,2]) {
    assert.equal(aco.readUInt16BE(offset),version);assert.equal(aco.readUInt16BE(offset+2),colors.length);offset+=4;
    for(let i=0;i<colors.length;i++) {
      assert.equal(aco.readUInt16BE(offset),0);offset+=2;
      for(const channel of expected[i]) {assert.equal(aco.readUInt16BE(offset),channel*257);offset+=2;}
      assert.equal(aco.readUInt16BE(offset),0);offset+=2;
      if(version===2) {
        const length=aco.readUInt32BE(offset);offset+=4;
        assert.equal(readName(aco,offset,length),names[i]);assert.equal(aco.readUInt16BE(offset+2*(length-1)),0);offset+=2*length;
      }
    }
  }
  assert.equal(offset,aco.length);
});
