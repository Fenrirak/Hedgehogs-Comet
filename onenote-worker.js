// Notebook files are never uploaded. Parsing runs in an isolated, timed worker.
importScripts('./vendor/pyodide/pyodide.js');
self.onmessage=async({data:{file}})=>{
  let archive;
  const progress=message=>self.postMessage({progress:message});
  try{
    progress('Starting the local notebook reader…');
    const py=await loadPyodide({indexURL:new URL('./vendor/pyodide/',location.href).href});
    py.FS.mkdirTree('/home/pyodide/pyOneNote');
    const names=['__init__.py','FileNode.py','Header.py','OneDocument.py'];
    await Promise.all(names.map(async name=>{const response=await fetch('./vendor/pyonenote/pyOneNote/'+name);if(!response.ok)throw new Error('Notebook reader files are missing.');py.FS.writeFile('/home/pyodide/pyOneNote/'+name,await response.text());}));
    const reader=await fetch('./notebook-reader.py');if(!reader.ok)throw new Error('Notebook reader is missing.');await py.runPythonAsync(await reader.text());
    let sections=[];
    if(/\.one$/i.test(file.name))sections=[{file}];
    else{
      const bytes=new Uint8Array(await file.slice(0,4).arrayBuffer());
      if(String.fromCharCode(...bytes)!=='MSCF')throw new Error('This is not a OneNote notebook package. Export Notebook → OneNote Package (.onepkg) from OneNote desktop.');
      const {Archive}=await import('./vendor/libarchive/libarchive.js');
      Archive.init({workerUrl:new URL('./vendor/libarchive/worker-bundle.js',location.href)});
      archive=await Archive.open(file);
      const entries=await archive.getFilesArray();
      if(entries.length>400)throw new Error('This notebook has too many files. Export a smaller section.');
      const total=entries.reduce((sum,e)=>sum+(e.file?.size||0),0);
      if(total>80*1024*1024)throw new Error('This notebook expands beyond 80 MB. Export a smaller section.');
      sections=entries.filter(e=>/\.one$/i.test(e.file?.name||''));
      if(sections.length>60)throw new Error('Import up to 60 sections at a time.');
      if(!sections.length)throw new Error('No OneNote sections were found in this package.');
    }
    const texts=[],warnings=[];
    for(let i=0;i<sections.length;i++){
      const entry=sections[i];progress(`Reading OneNote section ${i+1} of ${sections.length}…`);
      try{
        const section=entry.file instanceof File?entry.file:await entry.file.extract();
        if(section.size>40*1024*1024)throw new Error('Section exceeds 40 MB.');
        const bytes=new Uint8Array(await section.arrayBuffer());
        // No notebook code is executed; only structured text properties are read.
        py.globals.set('section_bytes',bytes);
        const value=await py.runPythonAsync('read_section(section_bytes.to_py())');
        py.globals.delete('section_bytes');
        if(value.trim())texts.push(value);
        if(texts.join('\n').length>200000)throw new Error('Use a smaller notebook below 200,000 extracted characters.');
      }catch(error){warnings.push(`${entry.file.name}: could not read this section. Try exporting it to PDF/DOCX.`);}
    }
    const text=texts.join('\n\n');
    if(text.length>200000)throw new Error('Use a smaller notebook below 200,000 extracted characters.');
    if(!text.trim())throw new Error('No typed text could be read. Encrypted sections, handwriting and some notebook versions need a PDF/DOCX export.');
    warnings.unshift('OneNote text recovered. Check against your notebook: layout, images, handwriting, reading order and historical revisions may differ. Only typed text is imported.');
    self.postMessage({result:{text,warnings}});
  }catch(error){self.postMessage({error:error.message||'This notebook could not be read. Try PDF/DOCX export.'});}
  finally{await archive?.close();}
};
