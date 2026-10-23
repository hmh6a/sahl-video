const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{ProjectRouter}=require('../app/project-router');
test('IPC stays bound to its project and closing a destroyed webContents safely removes only its routes',()=>{
 const handlers=new Map(),events=new Map(),router=new ProjectRouter({handle:(key,fn)=>{assert.ok(!handlers.has(key));handlers.set(key,fn);},on:(key,fn)=>events.set(key,fn)});
 const a=new EventEmitter(),b=new EventEmitter();let destroyed=false;
 Object.defineProperty(a,'webContents',{get(){if(destroyed)throw Error('Object has been destroyed');return {id:1};}});b.webContents={id:2};
 const one=router.forWindow(a),two=router.forWindow(b);one.handle('read',()=>1);two.handle('read',()=>2);
 let first=0,second=0;one.on('edit',()=>first++);two.on('edit',()=>second++);
 assert.equal(handlers.get('read')({sender:{id:1}}),1);assert.equal(handlers.get('read')({sender:{id:2}}),2);
 events.get('edit')({sender:{id:2}});assert.equal(first,0);assert.equal(second,1);
 destroyed=true;assert.doesNotThrow(()=>a.emit('closed'));assert.throws(()=>handlers.get('read')({sender:{id:1}}),/غير متاحة/);
 assert.equal(handlers.get('read')({sender:{id:2}}),2);assert.throws(()=>handlers.get('read')({sender:{id:99}}));
});
