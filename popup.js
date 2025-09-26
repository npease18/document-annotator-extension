// Handles activation toggle, shows list of shots, and generates ZIP + PDFs
(async function(){
  const toggleBtn = document.getElementById('toggle');
  const clearBtn = document.getElementById('clear');
  const downloadBtn = document.getElementById('downloadAll');
  const status = document.getElementById('status');
  const shotList = document.getElementById('shotList');

  let active = await isActive() ?? false;

  function refreshList(shots) {
    status.textContent = `Shots: ${shots.length}`;
    shotList.innerHTML = '';
    for (const s of shots) {
      const li = document.createElement('li');
      li.className = 'shot';
      li.textContent = `#${s.step} — ${s.info} — ${new Date(s.timestamp).toLocaleString()} — ${s.url}`;
      shotList.appendChild(li);
    }
  }

  function getStepName(s) {
    console.log(s.info);
    return `Step ${s.step}: ${s.info}`;
  }

  async function getShots() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({type:'get-shots'}, (resp) => {
        resolve(resp?.shots || []);
      });
    });
  }

  async function isActive() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({type:'get-active'}, (resp) => {
        resolve(resp?.active);
      });
    });
  }

  toggleBtn.addEventListener('click', async () => {
    console.log(active);
    active = !active;
    // toggleBtn.textContent = active ? 'Deactivate' : 'Activate';
    // Broadcast activation to all tabs' content scripts
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      try {
        chrome.tabs.sendMessage(t.id, {type: active ? 'activate' : 'deactivate'});
      } catch (e) {}
    }
    // Also inform background if needed
    chrome.runtime.sendMessage({type:'set-active', active});
  });

  clearBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({type:'clear-shots'}, async () => {
      const shots = await getShots();
      refreshList(shots);
    });
  });

  downloadBtn.addEventListener('click', async () => {
    const shots = await getShots();
    if (!shots || shots.length === 0) {
      alert('No shots recorded.');
      return;
    }

    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Preparing...';

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation: 'portrait'});

    try {
      // Create ZIP with all images
      const zip = new JSZip();

      for (const s of shots) {
        // Convert dataURL to blob
        const res = await fetch(s.dataUrl);
        const blob = await res.blob();
        const imgName = String(s.step).padStart(2,'0') + '_click.png';
        zip.file(imgName, blob);

        // Create a PDF for this step
        const imgBase64 = s.dataUrl;
        const img = new Image();
        img.src = imgBase64;
        await new Promise(r => img.onload = r);

        // Create PDF page sized to the image (fit to A4-ish)
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();

        // Add a header describing the click
        pdf.setFontSize(12);
        pdf.text(getStepName(s), 10, 12);
        // pdf.text(`Step ${s.step}: ${s.info}`, 10, 12);

        // Calculate image placement
        const marginTop = 20;
        let imgW = pageW - 20; // 10mm margins
        let imgH = (img.height / img.width) * imgW;
        if (imgH > pageH - marginTop - 10) {
          imgH = pageH - marginTop - 10;
          imgW = (img.width / img.height) * imgH;
        }
        const x = (pageW - imgW) / 2;
        const y = marginTop;

        pdf.addImage(imgBase64, 'PNG', x, y, imgW, imgH);
        if (s.step < shots.length) {pdf.addPage();}
    }
        // Save pdf bytes in memory
        const pdfBlob = pdf.output('blob');
        zip.file('steps.pdf', pdfBlob);

      // finalize zip
      const zipBlob = await zip.generateAsync({type:'blob'});
      const zipName = `click-steps_${Date.now()}.zip`;
      saveAs(zipBlob, zipName);

    } catch (e) {
      console.error(e);
      alert('Failed to generate ZIP/PDFs: ' + e.message);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download ZIP + PDFs';
      const shotsNow = await getShots();
      refreshList(shotsNow);
    }
  });

  // Initial populate
  const initial = await getShots();
  toggleBtn.textContent = active ? 'Deactivate' : 'Activate';
  refreshList(initial);

  // Refresh periodically while popup is open
  setInterval(async ()=>{
    const s = await getShots();
    const a = await isActive();
    toggleBtn.textContent = a ? 'Deactivate' : 'Activate';
    refreshList(s);
  }, 1000);

})();