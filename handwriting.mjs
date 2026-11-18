export async function recogniseHandwriting(file,progress){
 const config=window.KOTOBA_CONFIG;
 if(!config?.firebase||!config.handwritingEnabled)throw new Error('Handwriting recognition is not configured yet. Use printed-text OCR or type/correct your handwritten notes below.');
 const [{getAuth},{getFunctions,httpsCallable}]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js')]);
 if(!getAuth().currentUser)throw new Error('Sign in before using handwriting recognition.');
 progress('Preparing handwriting image…');const bitmap=await createImageBitmap(file);const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const image=canvas.toDataURL('image/jpeg',.92).split(',')[1];canvas.width=canvas.height=0;
 progress('Recognising handwritten Japanese…');const call=httpsCallable(getFunctions(undefined,config.functionsRegion||'australia-southeast1'),'recogniseHandwriting');const result=await call({image});return result.data.text;
}
