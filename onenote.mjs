export async function readNotebook(file,progress){
  if(location.protocol==='file:')throw new Error('Direct OneNote import needs the hosted website or a local web server. Use the GitHub Pages version.');
  const worker=new Worker(new URL('./onenote-worker.js',import.meta.url));
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('This notebook took too long. Export a smaller section or a PDF.'));},180000);
    worker.onmessage=event=>{const data=event.data;if(data.progress){progress(data.progress);return;}clearTimeout(timer);worker.terminate();if(data.error)reject(new Error(data.error));else resolve(data.result);};
    worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('The notebook reader could not start. Try a smaller section, or export PDF/DOCX.'));};
    worker.postMessage({file});
  });
}
