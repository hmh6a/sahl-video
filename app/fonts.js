// Load the packaged font before drawing text into preview/export canvases.
const bundledFontsReady=Promise.all([document.fonts.load('400 88px "Anton"','ANTON'),document.fonts.load('700 88px "Anton"','ANTON')]).then(loaded=>{if(loaded.some(f=>!f.length))throw new Error('Anton');return true;});
bundledFontsReady.then(()=>{const option=document.querySelector('#font option[value=Anton]');if(option){option.disabled=false;option.textContent='Anton — مضمّن';}if(typeof draw==='function')draw();}).catch(e=>{if(typeof status==='function')status('تعذّر تحميل خط Anton: '+e.message,true);});
