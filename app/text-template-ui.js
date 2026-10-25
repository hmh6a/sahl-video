function openTextTemplates(){
 if(busy)return;
 const locked=titlesLocked,hasTitle=!!currentTitle();
 $('template-picker-note').textContent=locked?'النصوص مقفولة. فك القفل حتى تغيّر القالب.':hasTitle?'اضغط على الشكل لتطبيقه على النص المحدد. تبقى كتابتك وتوقيتها ومكانها.':'اختار شكل، ونضيفلك نص جديد جاهز لتغيير الكتابة.';
 const grid=$('template-picker-grid');grid.replaceChildren();
 for(const original of document.querySelectorAll('#panel-templates .template')){
  const button=original.cloneNode(true);button.classList.remove('template','selected');button.classList.add('template-choice');
  button.setAttribute('aria-label','قالب '+original.querySelector('b').textContent);
  button.disabled=locked||!hasTitle&&titles.length>=24;
  button.setAttribute('aria-pressed',String(hasTitle&&currentTitle().template===original.dataset.template));
  button.onclick=()=>{
   if(busy||titlesLocked)return;
   if(!currentTitle())$('add-text').click();if(!currentTitle())return;
   original.click();$('text-template-dialog').close();showProperties('text');$('title').focus();
  };grid.append(button);
 }
 const layouts=$('template-picker-layouts');layouts.replaceChildren();$('template-picker-saved').hidden=!savedLayouts.length;
 for(const layout of savedLayouts){
  const button=document.createElement('button');button.textContent=layout.name+' · '+layout.titles.length+' نص';button.disabled=locked;
  button.onclick=()=>{if(busy||titlesLocked)return;renderSavedLayouts(layout.id);$('apply-layout').click();$('text-template-dialog').close();showProperties('text');$('title').focus();};layouts.append(button);
 }
 if(!$('text-template-dialog').open)$('text-template-dialog').showModal();
}
$('choose-title-template').onclick=$('nav-templates').onclick=openTextTemplates;
UIIcons.button('nav-templates','grid','قوالب النص');
UIIcons.button('choose-title-template','grid','قوالب النص');
$('close-text-template').onclick=()=>$('text-template-dialog').close();
