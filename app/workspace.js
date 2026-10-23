const list=document.getElementById('project-tabs'),rows=new Map();let active,latestState;
async function action(fn){try{const result=await fn();document.getElementById('workspace-error').textContent=result?.error||'';}catch(e){document.getElementById('workspace-error').textContent=e.message;}}
function renameTab(id){
  const row=rows.get(id),tab=latestState?.tabs.find(t=>t.id===id);if(!row||!tab||latestState.busy||row.querySelector('input'))return;
  const input=document.createElement('input');input.className='tab-rename';input.value=tab.name;input.maxLength=64;input.dir='auto';input.setAttribute('aria-label','اسم المشروع');input.title='Enter لحفظ الاسم · Esc للإلغاء · اتركه فارغاً للاسم التلقائي';
  row.classList.add('renaming');row.append(input);input.focus();input.select();let finished=false;
  const finish=save=>{if(finished)return;finished=true;const name=input.value;input.remove();row.classList.remove('renaming');if(save&&name!==tab.name)action(()=>workspace.rename(id,name));};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(e.key==='Enter');row.querySelector('.tab-select').focus();}});
  input.addEventListener('blur',()=>finish(true));
}
function render(state){
  latestState=state;
  const ids=new Set(state.tabs.map(tab=>tab.id));for(const [id,row]of rows)if(!ids.has(id)){row.remove();rows.delete(id);}
  for(const tab of state.tabs){
    let row=rows.get(tab.id);
    if(!row){
      row=document.createElement('div');row.className='project-tab';row.dataset.tabId=tab.id;
      row.innerHTML='<button class="tab-select" role="tab"><span class="tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M16 3v18M4 8h4M4 16h4M16 8h4M16 16h4"/></svg></span><span class="tab-name" dir="auto"></span><span class="tab-dirty" aria-label="تغييرات غير محفوظة"></span><span class="tab-status"></span></button><button class="tab-close" title="إغلاق التاب (Ctrl+W)"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>';
      row.querySelector('.tab-select').onclick=()=>action(()=>workspace.select(tab.id));row.querySelector('.tab-close').onclick=()=>action(()=>workspace.close(tab.id));list.append(row);rows.set(tab.id,row);
      row.querySelector('.tab-select').ondblclick=()=>renameTab(tab.id);
      row.querySelector('.tab-select').oncontextmenu=e=>{e.preventDefault();renameTab(tab.id);};
    }
    const selected=state.active===tab.id,select=row.querySelector('.tab-select');row.classList.toggle('selected',selected);
    select.setAttribute('aria-selected',String(selected));select.tabIndex=selected?0:-1;select.disabled=state.busy;
    row.querySelector('.tab-close').hidden=state.tabs.length===1;row.querySelector('.tab-close').disabled=state.busy||state.tabs.length===1;row.querySelector('.tab-close').setAttribute('aria-label','إغلاق '+tab.name);
    row.querySelector('.tab-name').textContent=tab.name;row.querySelector('.tab-dirty').hidden=!tab.dirty;
    const status=tab.status||{},label=status.phase==='queued'?'بالانتظار':['rendering','finalizing'].includes(status.phase)?Math.floor(status.percent||0)+'%':status.phase==='complete'?'اكتمل':status.phase==='error'?'تعذّر التصدير':'';
    row.dataset.phase=status.phase||'';row.querySelector('.tab-status').textContent=label;row.querySelector('.tab-status').hidden=!label;select.title=tab.name+(tab.dirty?' — تغييرات غير محفوظة':'')+(label?' — '+label:'')+' · دبل كلك أو F2 لتغيير الاسم';
  }
  if(active!==state.active)rows.get(state.active)?.scrollIntoView({block:'nearest',inline:'nearest'});active=state.active;
  document.getElementById('new-tab').disabled=state.busy;
  document.getElementById('project-count').textContent=String(state.tabs.length);document.getElementById('project-count').setAttribute('aria-label','عدد المشاريع المفتوحة: '+state.tabs.length);
}
list.addEventListener('keydown',e=>{
  if(e.key==='F2'&&e.target.matches('.tab-select')){e.preventDefault();renameTab(e.target.closest('.project-tab').dataset.tabId);return;}
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)||!e.target.matches('.tab-select'))return;
  const buttons=[...list.querySelectorAll('.tab-select')],index=buttons.indexOf(e.target),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowLeft'?1:-1)+buttons.length)%buttons.length;
  e.preventDefault();buttons[next].click();buttons[next].focus();
});
document.getElementById('new-tab').onclick=()=>action(()=>workspace.create());workspace.onState(render);workspace.state().then(render);
