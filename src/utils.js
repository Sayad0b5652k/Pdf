// @ts-nocheck

export function toast(msg){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2200);
}

export const Sheet = {
  el: null,
  backdrop: null,
  body: null,
  fade: null,
  progressContainer: null,
  progressBar: null,
  init() {
    this.el = document.getElementById('sheet');
    this.backdrop = document.getElementById('sheet-backdrop');
    this.body = document.getElementById('sheet-body');
    this.fade = document.getElementById('sheet-fade-bottom');
    this.progressContainer = document.getElementById('sheet-scroll-progress');
    this.progressBar = document.getElementById('sheet-scroll-progress-bar');

    if (this.backdrop) {
      this.backdrop.addEventListener('click', () => this.close());
    }
    if (this.body) {
      this.body.addEventListener('scroll', () => this.updateScrollIndicator(), { passive: true });
    }
    if (this.el) {
      let startY = 0;
      let startX = 0;
      let isHandleTouch = false;

      // Only listen on the top sheet-handle for downward swipe to close.
      // Touches inside the body / menus / tabs / ai results will NEVER close the sheet on scroll!
      this.el.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          startY = e.touches[0].clientY;
          startX = e.touches[0].clientX;
          const target = e.target;
          isHandleTouch = !!(target && (target.classList.contains('sheet-handle') || target.closest('.sheet-handle')));
        }
      }, { passive: true });

      this.el.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const dy = e.changedTouches[0].clientY - startY;
          const dx = Math.abs(e.changedTouches[0].clientX - startX);

          // Only close if user deliberately pulled down directly on the top handle bar
          if (isHandleTouch && dy > 60 && dy > dx * 1.5) {
            this.close();
          }
          isHandleTouch = false;
        }
      }, { passive: true });
    }
  },
  updateScrollIndicator() {
    if (!this.body) return;
    if (!this.fade) this.fade = document.getElementById('sheet-fade-bottom');
    if (!this.progressContainer) this.progressContainer = document.getElementById('sheet-scroll-progress');
    if (!this.progressBar) this.progressBar = document.getElementById('sheet-scroll-progress-bar');

    const { scrollTop, scrollHeight, clientHeight } = this.body;
    const isScrollable = scrollHeight > clientHeight + 12;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 12;

    if (this.fade) {
      this.fade.style.opacity = (isScrollable && !isNearBottom) ? '1' : '0';
    }
    if (this.progressContainer) {
      this.progressContainer.style.opacity = isScrollable ? '1' : '0';
    }
    if (this.progressBar && isScrollable) {
      const maxScroll = scrollHeight - clientHeight;
      const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      this.progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
  },
  open(html, options = {}){
    if (!this.body) this.init();
    if (typeof window.hideSelToolbar === 'function') {
      window.hideSelToolbar();
    }
    const isAlreadyOpen = this.el && this.el.classList.contains('open');
    const shouldPreserve = options.preserveScroll !== undefined
      ? options.preserveScroll
      : (isAlreadyOpen && !options.resetScroll);
    const prevScroll = (shouldPreserve && this.body) ? this.body.scrollTop : 0;

    this.body.innerHTML = html;
    if (shouldPreserve && this.body && prevScroll > 0) {
      this.body.scrollTop = prevScroll;
    } else if (this.body) {
      this.body.scrollTop = 0;
    }
    this.el.classList.add('open');
    this.backdrop.classList.add('open');
    keepBottomBarPositioned(this.el);

    this.body.querySelectorAll('.sheet-close-btn, [data-sheet-close]').forEach(btn => {
      btn.onclick = () => this.close();
    });

    requestAnimationFrame(() => {
      if (shouldPreserve && this.body && prevScroll > 0) {
        this.body.scrollTop = prevScroll;
      }
      this.updateScrollIndicator();
    });
    setTimeout(() => {
      if (shouldPreserve && this.body && prevScroll > 0) {
        this.body.scrollTop = prevScroll;
      }
      this.updateScrollIndicator();
    }, 100);
    setTimeout(() => this.updateScrollIndicator(), 300);
  },
  close(){
    if (!this.el) return;
    this.el.classList.remove('open');
    this.backdrop.classList.remove('open');
    if (window._readerSettingsTimer) {
      clearInterval(window._readerSettingsTimer);
      window._readerSettingsTimer = null;
    }
    if (window._goalSummaryTimer) {
      clearInterval(window._goalSummaryTimer);
      window._goalSummaryTimer = null;
    }
  }
};

export async function copyToClipboard(text){
  if(!text) return false;
  if(navigator.clipboard && navigator.clipboard.writeText){
    try{ await navigator.clipboard.writeText(text); return true; }
    catch(err){ console.warn('navigator.clipboard failed, falling back:', err.message); }
  }
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed; top:-1000px; left:-1000px; opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }catch(err){
    console.warn('Fallback copy failed:', err.message);
    return false;
  }
}

export function stripMarkdown(s){
  return (s||'')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '');
}

export function cleanRawMathAndSymbols(text) {
  if (!text) return '';
  let s = text;

  // Clean raw LaTeX environments like \begin{...} and \end{...}
  s = s.replace(/\\begin\{[a-zA-Z0-9*]+\}/g, '');
  s = s.replace(/\\end\{[a-zA-Z0-9*]+\}/g, '');

  // Clean boxed, textbf, textit, mathrm, mathbf, etc.
  s = s.replace(/\\boxed\{([^}]+)\}/g, '$1');
  s = s.replace(/\\textbf\{([^}]+)\}/g, '**$1**');
  s = s.replace(/\\textit\{([^}]+)\}/g, '*$1*');
  s = s.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  s = s.replace(/\\mathbf\{([^}]+)\}/g, '$1');

  // If KaTeX is available (or will auto-render), preserve $$ and $ math blocks intact!
  if (typeof window.katex !== 'undefined' || typeof window.renderMathInElement === 'function') {
    // Preserve math blocks for KaTeX renderer
    return s;
  }

  // Fallback cleaner for environments where KaTeX is not loaded:
  // Replace double dollar display math with clean block math
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, eq) => {
    let cleanEq = eq
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\times/g, ' × ')
      .replace(/\\div/g, ' ÷ ')
      .replace(/\\pm/g, ' ± ')
      .replace(/\\neq/g, ' ≠ ')
      .replace(/\\leq/g, ' ≤ ')
      .replace(/\\geq/g, ' ≥ ')
      .replace(/\\approx/g, ' ≈ ')
      .replace(/\\cdot/g, ' · ')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\rightarrow/g, ' → ')
      .replace(/\\leftarrow/g, ' ← ')
      .replace(/\\Rightarrow/g, ' ⇒ ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\omega/g, 'ω')
      .replace(/\\infty/g, '∞')
      .replace(/\\sum/g, '∑')
      .replace(/\\int/g, '∫')
      .replace(/\\left|\\right/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `\n> 📐 **Formula / Equation**: \`${cleanEq}\`\n`;
  });

  // Replace single dollar inline math
  s = s.replace(/\$([^\$\n]+?)\$/g, (_, eq) => {
    let cleanEq = eq
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\times/g, ' × ')
      .replace(/\\div/g, ' ÷ ')
      .replace(/\\pm/g, ' ± ')
      .replace(/\\neq/g, ' ≠ ')
      .replace(/\\leq/g, ' ≤ ')
      .replace(/\\geq/g, ' ≥ ')
      .replace(/\\approx/g, ' ≈ ')
      .replace(/\\cdot/g, ' · ')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\rightarrow/g, ' → ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\left|\\right/g, '')
      .replace(/[{}]/g, '')
      .trim();
    return `\`${cleanEq}\``;
  });

  // Clean remaining lonely LaTeX artifacts
  s = s.replace(/\\text\{([^}]+)\}/g, '$1');
  s = s.replace(/\\{([a-zA-Z0-9_\s,-]+)\\}/g, '($1)');
  s = s.replace(/\\quad/g, ' ');
  s = s.replace(/\\qquad/g, '   ');
  s = s.replace(/\\,/g, ' ');

  // Clean up weird backslash-escaped characters that AI sometimes outputs like \* or \#
  s = s.replace(/\\([*#_`~[\]()])/g, '$1');

  // Clean robotic AI disclaimers or book nagging phrases
  s = s.replace(/\s*\(\s*(?:External Knowledge|Web Search|Book ke bahar se)[^)]*\)/gi, '');
  s = s.replace(/\*+\s*\(\s*(?:External Knowledge|Web Search|Book ke bahar se)[^)]*\)\s*\*+/gi, '');
  s = s.replace(/(?:Would you like to (?:continue with|return to) your .*? textbook|Ready to (?:return to|tackle) .*?\?)\s*$/gi, '');

  return s;
}

export function renderMarkdown(raw){
  const sanitized = cleanRawMathAndSymbols(raw || '');
  const lines = sanitized.replace(/\r\n/g,'\n').split('\n');
  let html = '', listType = null, paraBuffer = [];
  let inCodeBlock = false, codeBuffer = [], codeBlockLang = '';
  let inTable = false, tableRows = [];

  const inline = (s)=>{
    // Escape HTML first to prevent XSS
    s = escapeHtml(s);

    // Triple asterisks bold-italic: ***text***
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong style="color:var(--text); font-weight:700;"><em style="color:var(--text);">$1</em></strong>');
    // Double asterisks bold: **text**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text); font-weight:700;">$1</strong>');
    // Single asterisk italics: *text* (word must not be space)
    s = s.replace(/(^|[^*])\*([^*\n\s][^*\n]*?[^*\n\s]|[^*\n\s])\*(?!\*)/g, '$1<em style="color:var(--text);">$2</em>');
    // Inline code: `code`
    s = s.replace(/`([^`]+)`/g, '<code style="background:var(--surface-3); padding:2px 6px; border-radius:4px; font-size:.9em; color:var(--accent); font-weight:600; font-family:var(--font-mono, monospace);">$1</code>');
    
    // Interactive Page Citation Badges [Page X], [📖 Page X], (Page X)
    s = s.replace(/\[(?:📖\s*)?Page\s+(\d+)\]|\(Page\s+(\d+)\)/gi, (match, p1, p2) => {
      const pageNum = p1 || p2;
      return `<button class="inline-page-jump-chip" data-page="${pageNum}" title="Jump to Page ${pageNum} in PDF" style="display:inline-flex; align-items:center; gap:3px; padding:2px 7px; margin:0 2px; font-size:11.5px; font-weight:700; font-family:var(--font-mono, monospace); border-radius:6px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); cursor:pointer; vertical-align:middle; line-height:1.2; transition:all 0.15s ease;">📖 Page ${pageNum}</button>`;
    });

    // Remove any leftover raw/unmatched asterisks and hashtags in inline text
    s = s.replace(/(^|\s)\*{1,3}(?=\s|$)/g, '$1');
    s = s.replace(/(^|\s)#{1,6}(?=\s|$)/g, '$1');

    return s;
  };

  const createVisualCardHtml = (cleanAlt, safeUrl) => {
    const escapedAlt = escapeHtml(cleanAlt || 'Educational Visual');
    const escapedSafeAltParam = (cleanAlt || 'Educational Visual').replace(/['"\\]/g, ' ');
    const downloadFilename = (cleanAlt || 'visual').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanUrl = (safeUrl || '').trim();
    // Default to proxied URL for 100% reliable bypass of carrier blocks, CORS, and referer restrictions
    const initialSrc = (cleanUrl.startsWith('/api/') || cleanUrl.startsWith('data:'))
      ? cleanUrl
      : `/api/image-proxy?url=${encodeURIComponent(cleanUrl)}&subject=${encodeURIComponent(cleanAlt || '')}`;

    return `
      <div class="ai-generated-visual-card" style="margin:16px 0; border:1px solid var(--border); border-radius:14px; overflow:hidden; background:var(--surface-2); box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <div style="position:relative; width:100%; min-height:220px; max-height:460px; overflow:hidden; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.03); cursor:zoom-in;" onclick="window.openImageLightbox && window.openImageLightbox('${initialSrc}', '${escapedSafeAltParam}')" title="Click to open, zoom and pan in high-res">
          <img src="${initialSrc}" alt="${escapedAlt}" loading="eager" decoding="async" onerror="window.handleCardImageFallback && window.handleCardImageFallback(this, '${cleanUrl.replace(/'/g, "\\'")}', '${escapedSafeAltParam}')" style="max-width:100%; max-height:460px; object-fit:contain; transition:transform 0.25s ease;" />
          <div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); color:#fff; font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px; display:flex; align-items:center; gap:4px; pointer-events:none;">
            <span>🔍 Tap to Zoom</span>
          </div>
        </div>
        <div style="padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-top:1px solid var(--border); background:var(--surface);">
          <div style="display:flex; align-items:center; gap:6px; min-width:0;">
            <span style="font-size:14px;">🖼️</span>
            <span style="font-size:12.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapedAlt}">${escapedAlt}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <button class="btn" onclick="window.openImageLightbox && window.openImageLightbox('${initialSrc}', '${escapedSafeAltParam}')" style="height:28px; padding:0 10px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <span>🔍 Zoom</span>
            </button>
            <a href="${initialSrc}" download="${downloadFilename}.png" target="_blank" class="btn" style="height:28px; padding:0 10px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--accent-soft); border:1px solid var(--accent); color:var(--accent); text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
              <span>⬇️ Download</span>
            </a>
          </div>
        </div>
      </div>`;
  };

  const flushPara = ()=>{
    if(paraBuffer.length){
      const text = paraBuffer.join(' ');
      // Check if paragraph contains markdown images (supports both /api/image-proxy and absolute URLs)
      const imgRegex = /!\[(.*?)\]\(((?:https?:\/\/|\/api\/|\/)[^\r\n()]+(?:\([^\r\n()]+\)[^\r\n()]*)*)\)(?=\s|$)/g;
      if (imgRegex.test(text)) {
        let lastIdx = 0;
        let m;
        imgRegex.lastIndex = 0;
        while ((m = imgRegex.exec(text)) !== null) {
          const before = text.slice(lastIdx, m.index).trim();
          if (before) {
            html += `<p style="margin:0 0 10px; line-height:1.68; font-size:14px; color:var(--text);">${inline(before)}</p>`;
          }
          html += createVisualCardHtml(m[1], m[2]);
          lastIdx = m.index + m[0].length;
        }
        const after = text.slice(lastIdx).trim();
        if (after) {
          html += `<p style="margin:0 0 10px; line-height:1.68; font-size:14px; color:var(--text);">${inline(after)}</p>`;
        }
      } else {
        html += `<p style="margin:0 0 10px; line-height:1.68; font-size:14px; color:var(--text);">${inline(text)}</p>`;
      }
      paraBuffer = [];
    }
  };
  const closeList = ()=>{ if(listType){ html += `</${listType}>`; listType = null; } };

  const flushTable = ()=>{
    if(inTable && tableRows.length){
      let tableHtml = `<div style="overflow-x:auto; margin:14px 0; border:1px solid var(--border); border-radius:10px; background:var(--bg-elev);"><table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">`;
      tableRows.forEach((row, rIdx) => {
        const cells = row.split('|').map(c => c.trim()).filter((c, i, a) => !(i === 0 && c === '') && !(i === a.length - 1 && c === ''));
        if(cells.every(c => /^[:\s-]+$/.test(c))) return; // Skip separator line
        const isHeader = rIdx === 0;
        const tag = isHeader ? 'th' : 'td';
        const cellStyle = isHeader
          ? 'background:var(--surface-2); padding:10px 12px; font-weight:700; border-bottom:2px solid var(--border); color:var(--accent); font-family:\'Space Grotesk\', sans-serif;'
          : 'padding:9px 12px; border-bottom:1px solid var(--border); color:var(--text);';
        tableHtml += `<tr style="${isHeader ? '' : 'background:var(--surface);'}">${cells.map(c => `<${tag} style="${cellStyle}">${inline(c)}</${tag}>`).join('')}</tr>`;
      });
      tableHtml += `</table></div>`;
      html += tableHtml;
      tableRows = [];
      inTable = false;
    }
  };

  for(const rawLine of lines){
    const line = rawLine.trim();

    // Code block toggle (``` or ```ascii or ```tree or ```mermaid)
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const isMermaid = codeBlockLang === 'mermaid' || codeBuffer.some(l => /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|mindmap|timeline)\b/i.test(l.trim()));
        if (isMermaid) {
          const rawDiagram = codeBuffer.join('\n').trim();
          html += `
            <div class="mermaid-block-wrapper" style="margin:16px 0; border:1px solid var(--border); border-radius:14px; background:var(--surface-2); overflow:hidden; box-shadow:0 4px 18px rgba(0,0,0,0.06);">
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; padding:8px 12px; background:var(--surface-3, var(--surface)); border-bottom:1px solid var(--border); font-size:12px; font-weight:700; color:var(--text);">
                <span style="display:flex; align-items:center; gap:5px; color:var(--accent); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11.5px;">
                  <span>📊 Flowchart</span>
                </span>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0; margin-left:auto;">
                  <button class="btn btn-zoom-diagram" onclick="window.openDiagramLightbox && window.openDiagramLightbox(this)" title="Open in Fullscreen &amp; Zoom" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:6px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); cursor:pointer; display:inline-flex; align-items:center; gap:3px; flex-shrink:0; white-space:nowrap;">
                    <span>🔍 Zoom</span>
                  </button>
                  <button class="btn btn-download-diagram" onclick="window.downloadDiagram && window.downloadDiagram(this)" title="Download Diagram as Image" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:6px; background:var(--accent-soft); border:1px solid var(--accent); color:var(--accent); cursor:pointer; display:inline-flex; align-items:center; gap:3px; flex-shrink:0; white-space:nowrap;">
                    <span>⬇️ Save</span>
                  </button>
                  <button class="btn btn-copy-diagram" onclick="window.copyToClipboard && window.copyToClipboard('${escapeHtml(rawDiagram).replace(/'/g, "\\'")}', this)" style="height:24px; padding:0 7px; font-size:11px; font-weight:600; border-radius:6px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); cursor:pointer; flex-shrink:0; white-space:nowrap;">
                    <span>📋 Code</span>
                  </button>
                </div>
              </div>
              <div class="diagram-render-area" style="padding:16px 12px; overflow-x:auto; text-align:center; min-height:80px; background:var(--surface); display:flex; justify-content:center; align-items:center;">
                <div class="mermaid" style="display:flex; justify-content:center; width:100%; min-height:60px;">${escapeHtml(rawDiagram)}</div>
              </div>
            </div>`;
        } else {
          html += `<pre class="no-scrollbar" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; font-family:'Courier New', Consolas, monospace; font-size:12.5px; line-height:1.55; color:var(--text); overflow-x:auto; margin:12px 0; white-space:pre; scrollbar-width:none; -ms-overflow-style:none;"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
        }
        codeBuffer = [];
        inCodeBlock = false;
        codeBlockLang = '';
      } else {
        flushPara(); closeList(); flushTable();
        inCodeBlock = true;
        codeBlockLang = line.replace(/^```/, '').trim().toLowerCase();
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Markdown Table Detection
    if (line.startsWith('|') && line.endsWith('|')) {
      flushPara(); closeList();
      inTable = true;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if(!line){ flushPara(); closeList(); continue; }

    // Standalone Markdown Image Line: ![alt](url)
    const blockImgMatch = line.match(/^!\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/);
    if (blockImgMatch) {
      flushPara(); closeList();
      html += createVisualCardHtml(blockImgMatch[1], blockImgMatch[2]);
      continue;
    }

    let m;
    if((m = line.match(/^#{1,6}\s*(.*)$/))){
      flushPara(); closeList();
      const level = line.match(/^#+/)[0].length;
      const headingContent = inline(m[1].replace(/^#{1,6}\s*/, '').trim());
      if (level === 1) {
        html += `<h3 style="margin:18px 0 10px; font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:17px; color:var(--accent); border-bottom:1.5px solid var(--accent-soft); padding-bottom:6px; display:flex; align-items:center; gap:8px;">${headingContent}</h3>`;
      } else if (level === 2) {
        html += `<h4 style="margin:16px 0 8px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15.5px; color:var(--text); display:flex; align-items:center; gap:6px;">${headingContent}</h4>`;
      } else if (level === 3) {
        html += `<h5 style="margin:14px 0 6px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:14.5px; color:var(--accent); background:var(--surface-2); padding:6px 12px; border-radius:8px; border-left:3.5px solid var(--accent); display:flex; align-items:center; gap:6px;">${headingContent}</h5>`;
      } else {
        html += `<h6 style="margin:12px 0 4px; font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:13.5px; color:var(--text-dim);">${headingContent}</h6>`;
      }
      continue;
    }
    if((m = line.match(/^>\s*(.*)$/))){
      flushPara(); closeList();
      html += `<blockquote style="margin:14px 0; padding:12px 16px; background:var(--accent-soft); border-left:4px solid var(--accent); border-radius:10px; font-size:13.8px; color:var(--text); line-height:1.65; box-shadow:0 1px 4px rgba(0,0,0,0.03);">${inline(m[1])}</blockquote>`;
      continue;
    }
    if((m = line.match(/^[-*•]\s+\[([ xX])\]\s+(.*)$/))){
      flushPara();
      const isChecked = m[1].toLowerCase() === 'x';
      if(listType!=='ul'){ closeList(); html += '<ul style="margin:0 0 12px; padding-left:4px; list-style:none; line-height:1.68; color:var(--text); font-size:14px;">'; listType='ul'; }
      html += `<li style="margin-bottom:6px; display:flex; align-items:center; gap:8px;"><span style="color:${isChecked ? 'var(--teal)' : 'var(--text-dim)'}; font-weight:bold;">${isChecked ? '☑' : '☐'}</span> ${inline(m[2])}</li>`;
      continue;
    }
    if((m = line.match(/^[-*•]\s+(.*)$/))){
      flushPara();
      if(listType!=='ul'){ closeList(); html += '<ul style="margin:0 0 12px; padding-left:20px; line-height:1.68; color:var(--text); font-size:14px;">'; listType='ul'; }
      html += `<li style="margin-bottom:6px;">${inline(m[1])}</li>`;
      continue;
    }
    if((m = line.match(/^(\d+)[.)]\s+(.*)$/))){
      flushPara();
      if(listType!=='ol'){ closeList(); html += '<ol style="margin:0 0 12px; padding-left:20px; line-height:1.68; color:var(--text); font-size:14px;">'; listType='ol'; }
      html += `<li style="margin-bottom:6px; font-weight:500;">${inline(m[2])}</li>`;
      continue;
    }
    closeList();
    paraBuffer.push(line);
  }
  if (inCodeBlock && codeBuffer.length) {
    html += `<pre class="no-scrollbar" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; font-family:'Courier New', Consolas, monospace; font-size:12.5px; line-height:1.55; color:var(--text); overflow-x:auto; margin:12px 0; white-space:pre; scrollbar-width:none; -ms-overflow-style:none;"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
  }
  flushTable();
  flushPara(); closeList();
  return html || `<p style="line-height:1.65; font-size:14px;">${inline(raw||'')}</p>`;
}

export function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
export function throttle(fn,ms){ let last=0, t; return (...a)=>{ const now=Date.now(); if(now-last>ms){ last=now; fn(...a);} else { clearTimeout(t); t=setTimeout(()=>{last=Date.now(); fn(...a);}, ms-(now-last)); } }; }

export function escapeHtml(s){
  if (s === null || s === undefined) return '';
  const str = typeof s === 'string' ? s : String(s);
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ============================================================
   MOBILE VIEWPORT FIX
   ============================================================ */
export function positionBottomBar(el){
  if(!el) return;
  if(window.visualViewport){
    const vv = window.visualViewport;
    const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    el.style.bottom = offset + 'px';
    if(el.id === 'sheet'){
      el.style.maxHeight = Math.min(vv.height * 0.82, vv.height - 24) + 'px';
    }
  } else {
    el.style.bottom = '0px';
    if(el.id === 'sheet') el.style.maxHeight = '';
  }
}

export function keepBottomBarPositioned(el, durationMs=600){
  if(!el) return;
  const start = performance.now();
  function tick(){
    positionBottomBar(el);
    if(performance.now()-start < durationMs) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ============================================================
   READING TIME & STATS TRACKER
   ============================================================ */

function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentWeekSunday(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

let activeSessionStart = null;
let readerTicker = null;
let currentSessionSecs = 0;
let hasRecordedCurrentSession = false;

export async function getReadingStats() {
  const defaultStats = {
    totalSeconds: 0,
    sessionsCount: 0,
    totalSessionSeconds: 0,
    dailyLog: {}
  };
  const stored = await window.DB.getSetting('reading_stats', null);
  const stats = stored ? { ...defaultStats, ...stored, dailyLog: { ...(defaultStats.dailyLog), ...(stored.dailyLog||{}) } } : defaultStats;

  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const dailyLog = { ...stats.dailyLog };
  if (currentSessionSecs > 0) {
    dailyLog[todayStr] = (dailyLog[todayStr] || 0) + currentSessionSecs;
  }

  // Calculate current week (Sunday 00:00:00 to Saturday 23:59:59)
  const sunday = getCurrentWeekSunday(now);
  const weekDays = [];
  let weeklySeconds = 0;
  let activeDaysThisWeek = 0;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dStr = getLocalDateStr(d);
    const secs = dailyLog[dStr] || 0;
    const isToday = dStr === todayStr;
    const isPastOrToday = d <= now || isToday;
    
    weeklySeconds += secs;
    if (secs >= 5 && isPastOrToday) {
      activeDaysThisWeek++;
    }

    weekDays.push({
      dayName: dayNames[i],
      dateStr: dStr,
      seconds: secs,
      minutes: Math.round(secs / 60),
      isToday
    });
  }

  // Format Weekly Read Time
  let readTimeFormatted = '0m';
  if (weeklySeconds < 60) {
    readTimeFormatted = weeklySeconds > 0 ? `${weeklySeconds}s` : '0m';
  } else if (weeklySeconds < 3600) {
    readTimeFormatted = `${Math.floor(weeklySeconds / 60)}m`;
  } else {
    const hrs = Math.floor(weeklySeconds / 3600);
    const mins = Math.floor((weeklySeconds % 3600) / 60);
    readTimeFormatted = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  // Calculate Monthly Read Time (Spent)
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let monthlySeconds = 0;
  Object.keys(dailyLog).forEach(dStr => {
    if (dStr.startsWith(currentMonthPrefix)) {
      monthlySeconds += dailyLog[dStr] || 0;
    }
  });

  let monthlyFormatted = '0m';
  if (monthlySeconds < 60) {
    monthlyFormatted = monthlySeconds > 0 ? `${monthlySeconds}s` : '0m';
  } else if (monthlySeconds < 3600) {
    monthlyFormatted = `${Math.floor(monthlySeconds / 60)}m`;
  } else {
    const hrs = Math.floor(monthlySeconds / 3600);
    const mins = Math.floor((monthlySeconds % 3600) / 60);
    monthlyFormatted = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  // Calculate Retention (Average PDF Reading Duration per session for the current week, refreshed weekly)
  let weeklySessionsCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dStr = getLocalDateStr(d);
    const daySecs = dailyLog[dStr] || 0;
    const recordedDaySessions = (stats.dailySessions && stats.dailySessions[dStr]) || 0;
    if (recordedDaySessions > 0) {
      weeklySessionsCount += recordedDaySessions;
    } else if (daySecs >= 10) {
      // Fallback for past recorded days without explicit session counts
      weeklySessionsCount += Math.max(1, Math.round(daySecs / 600));
    }
  }

  // Include active session if reading right now in reader
  if (currentSessionSecs >= 5 && !hasRecordedCurrentSession) {
    weeklySessionsCount += 1;
  }

  let avgWeeklySecs = 0;
  if (weeklySessionsCount > 0 && weeklySeconds > 0) {
    avgWeeklySecs = Math.round(weeklySeconds / weeklySessionsCount);
  } else if (activeDaysThisWeek > 0 && weeklySeconds > 0) {
    avgWeeklySecs = Math.round(weeklySeconds / activeDaysThisWeek);
  } else {
    avgWeeklySecs = 0;
  }

  let retentionFormatted = '0m';
  if (avgWeeklySecs <= 0) {
    retentionFormatted = '0m';
  } else if (avgWeeklySecs < 60) {
    retentionFormatted = `${avgWeeklySecs}s`;
  } else if (avgWeeklySecs < 3600) {
    const m = Math.round(avgWeeklySecs / 60);
    retentionFormatted = `${m}m`;
  } else {
    const h = Math.floor(avgWeeklySecs / 3600);
    const m = Math.round((avgWeeklySecs % 3600) / 60);
    retentionFormatted = m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // Weekly Streak
  let streakFormatted = `${activeDaysThisWeek}d`;

  return {
    weeklySeconds,
    monthlySeconds,
    monthlyFormatted,
    totalSeconds: stats.totalSeconds + currentSessionSecs,
    sessionsCount: weeklySessionsCount,
    readTimeFormatted,
    retentionFormatted,
    retentionPct: avgWeeklySecs,
    streakFormatted,
    streak: activeDaysThisWeek,
    weekDays
  };
}

export function startReadingSession() {
  stopReadingSession();
  if (typeof window !== 'undefined' && window.State && window.State.view !== 'reader') {
    // Only record time strictly inside PDF Reader
    return;
  }

  activeSessionStart = Date.now();
  currentSessionSecs = 0;
  hasRecordedCurrentSession = false;

  readerTicker = setInterval(() => {
    // Only tick when tab is visible and currently reading a PDF
    if (document.hidden) return;
    if (typeof window !== 'undefined' && window.State && window.State.view !== 'reader') {
      stopReadingSession();
      return;
    }
    currentSessionSecs++;
    if (currentSessionSecs > 0 && currentSessionSecs % 15 === 0) {
      flushCurrentReadingTime();
    }
  }, 1000);
}

export async function stopReadingSession() {
  if (readerTicker) {
    clearInterval(readerTicker);
    readerTicker = null;
  }
  if (currentSessionSecs > 0) {
    await flushCurrentReadingTime();
  }
  activeSessionStart = null;
  currentSessionSecs = 0;
  hasRecordedCurrentSession = false;
}

async function flushCurrentReadingTime() {
  if (currentSessionSecs <= 0) return;
  const secsToAdd = currentSessionSecs;
  currentSessionSecs = 0;

  const defaultStats = {
    totalSeconds: 0,
    sessionsCount: 0,
    totalSessionSeconds: 0,
    dailyLog: {},
    dailySessions: {}
  };
  const stored = await window.DB.getSetting('reading_stats', null);
  const stats = stored ? { 
    ...defaultStats, 
    ...stored, 
    dailyLog: { ...(defaultStats.dailyLog), ...(stored.dailyLog || {}) },
    dailySessions: { ...(defaultStats.dailySessions), ...(stored.dailySessions || {}) }
  } : defaultStats;

  const today = getLocalDateStr();
  stats.totalSeconds += secsToAdd;
  stats.totalSessionSeconds += secsToAdd;
  stats.dailyLog[today] = (stats.dailyLog[today] || 0) + secsToAdd;

  if (!hasRecordedCurrentSession && (stats.dailyLog[today] >= 5 || secsToAdd >= 5)) {
    stats.sessionsCount += 1;
    stats.dailySessions[today] = (stats.dailySessions[today] || 0) + 1;
    hasRecordedCurrentSession = true;
  }

  await window.DB.setting('reading_stats', stats);
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (window.State && window.State.view === 'reader' && currentSessionSecs > 0) {
        flushCurrentReadingTime();
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    if (window.State && window.State.view === 'reader' && currentSessionSecs > 0) {
      flushCurrentReadingTime();
    }
  });
}

export function renderMermaidDiagrams(container) {
  if (typeof window.mermaid !== 'undefined') {
    try {
      const isDark = document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark') || window.State?.theme === 'dark';
      window.mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        themeVariables: {
          darkMode: isDark,
          primaryColor: isDark ? '#1e293b' : '#eff6ff',
          primaryTextColor: isDark ? '#f8fafc' : '#0f172a',
          primaryBorderColor: isDark ? '#3b82f6' : '#2563eb',
          lineColor: isDark ? '#60a5fa' : '#3b82f6',
          secondaryColor: isDark ? '#0f172a' : '#f8fafc',
          tertiaryColor: isDark ? '#1e1e2e' : '#ffffff',
          edgeLabelBackground: isDark ? '#1e293b' : '#ffffff'
        },
        securityLevel: 'loose',
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
      });
      const nodes = (container || document).querySelectorAll('.mermaid:not([data-processed="true"])');
      if (nodes.length > 0) {
        window.mermaid.run({ nodes }).catch(e => {
          console.warn('Mermaid render error:', e);
        });
      }
    } catch(err) {
      console.warn('Mermaid initialization warning:', err);
    }
  }
}

export function renderMathFormulas(container) {
  if (typeof window.renderMathInElement === 'function') {
    try {
      window.renderMathInElement(container || document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    } catch (e) {
      console.warn('KaTeX math render warning:', e);
    }
  }
}

export function openImageLightbox(src, caption, options = {}) {
  const existing = document.getElementById('ai-image-lightbox');
  if (existing) existing.remove();

  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let touchStartDist = 0;
  let touchStartZoom = 1.0;

  const isSvg = options.isSvg || false;
  const svgHtml = options.svgHtml || '';

  const modal = document.createElement('div');
  modal.id = 'ai-image-lightbox';
  modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(5,9,14,0.94); backdrop-filter:blur(12px); display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:14px; user-select:none; -webkit-user-select:none; animation:fadeIn 0.18s ease;';

  const cleanCaption = caption || (isSvg ? 'Academic Flowchart' : 'Educational Visual');
  const fileName = cleanCaption.replace(/[^a-zA-Z0-9_-]/g, '_') || 'academic-visual';

  modal.innerHTML = `
    <!-- Top Control Toolbar -->
    <div style="width:100%; max-width:960px; display:flex; align-items:center; justify-content:space-between; gap:10px; z-index:20; background:rgba(20,28,38,0.8); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:8px 12px;">
      <div style="display:flex; align-items:center; gap:8px; min-width:0;">
        <span style="font-size:16px;">${isSvg ? '📊' : '🖼️'}</span>
        <span style="color:#fff; font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;">${escapeHtml(cleanCaption)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <!-- Zoom Controls -->
        <div style="display:inline-flex; align-items:center; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:2px;">
          <button id="lb-zoom-out" class="btn btn-icon" title="Zoom Out (-)" style="width:28px; height:28px; color:#fff; font-size:16px; font-weight:700; border:none; background:transparent; cursor:pointer;">−</button>
          <span id="lb-zoom-level" style="color:var(--accent, #4ade80); font-size:11.5px; font-weight:700; font-family:monospace; padding:0 6px; min-width:42px; text-align:center;">100%</span>
          <button id="lb-zoom-in" class="btn btn-icon" title="Zoom In (+)" style="width:28px; height:28px; color:#fff; font-size:16px; font-weight:700; border:none; background:transparent; cursor:pointer;">+</button>
          <button id="lb-zoom-reset" class="btn" title="Reset Zoom (1:1)" style="height:24px; padding:0 8px; font-size:10.5px; font-weight:600; color:#fff; border:none; background:rgba(255,255,255,0.15); border-radius:6px; margin-left:3px; cursor:pointer;">1:1</button>
        </div>

        <!-- Download Button -->
        ${isSvg ? `
          <button id="lb-download-btn" class="btn" title="Save Flowchart Image" style="height:30px; padding:0 10px; font-size:11.5px; font-weight:600; background:var(--accent, #3b82f6); color:#fff; border-radius:8px; border:none; display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
            <span>⬇️ Save</span>
          </button>
        ` : `
          <a id="lb-download-btn" href="${src}" download="${fileName}.png" target="_blank" class="btn" style="height:30px; padding:0 10px; font-size:11.5px; font-weight:600; background:var(--accent, #3b82f6); color:#fff; border-radius:8px; border:none; text-decoration:none; display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
            <span>⬇️ Save</span>
          </a>
        `}

        <!-- Close Button -->
        <button id="close-lightbox-btn" class="btn btn-icon" title="Close (Esc)" style="width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.18); color:#fff; border:none; cursor:pointer; font-size:13px; font-weight:700;">✕</button>
      </div>
    </div>

    <!-- Center Viewport with Hardware-Accelerated Smooth Transform -->
    <div id="lb-viewport" style="position:relative; width:100%; height:calc(100vh - 120px); overflow:hidden; display:flex; align-items:center; justify-content:center; cursor:grab; touch-action:none;">
      <div id="lb-transform-box" style="display:flex; align-items:center; justify-content:center; transform-origin:center center; will-change:transform; transform:translate3d(0,0,0) scale(1);">
        ${isSvg ? `
          <div id="lb-svg-card" style="background:var(--surface, #ffffff); border:1px solid var(--border, rgba(255,255,255,0.15)); border-radius:14px; padding:22px 26px; box-shadow:0 18px 56px rgba(0,0,0,0.6); max-width:92vw; max-height:80vh; overflow:auto; display:flex; align-items:center; justify-content:center; color:var(--text, #0f172a); pointer-events:none;">
            ${svgHtml || ''}
          </div>
        ` : `
          <img id="lb-image" src="${src}" alt="${escapeHtml(cleanCaption)}" loading="eager" decoding="async" onerror="if(!this.dataset.proxied && !'${src}'.startsWith('/api/')){this.dataset.proxied='1'; this.src='/api/image-proxy?url=' + encodeURIComponent('${src}') + '&subject=' + encodeURIComponent('${cleanCaption}');}" style="max-width:90vw; max-height:80vh; object-fit:contain; border-radius:8px; box-shadow:0 14px 48px rgba(0,0,0,0.7); pointer-events:none;" />
        `}
      </div>
    </div>

    <!-- Bottom Zoom / Pan Tip -->
    <div style="font-size:11px; color:rgba(255,255,255,0.65); padding:5px 12px; background:rgba(0,0,0,0.5); border-radius:20px; z-index:20; pointer-events:none;">
      💡 Pinch or Scroll to Zoom • Drag to Pan • 1:1 to reset
    </div>
  `;

  document.body.appendChild(modal);

  const transformBox = modal.querySelector('#lb-transform-box');
  const zoomLevelEl = modal.querySelector('#lb-zoom-level');
  const viewport = modal.querySelector('#lb-viewport');

  const updateTransform = () => {
    if (!transformBox) return;
    transformBox.style.transform = `translate3d(${panX}px, ${panY}px, 0px) scale(${zoom})`;
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(zoom * 100)}%`;
    }
    if (viewport) {
      viewport.style.cursor = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'grab';
    }
  };

  const setZoom = (newZoom, animated = true) => {
    zoom = Math.max(0.5, Math.min(5.0, newZoom));
    if (zoom <= 1) {
      panX = 0;
      panY = 0;
    }
    if (transformBox) {
      transformBox.style.transition = animated ? 'transform 0.16s cubic-bezier(0.2, 0, 0, 1)' : 'none';
    }
    updateTransform();
  };

  // Zoom In / Out / Reset
  modal.querySelector('#lb-zoom-in').onclick = (e) => { e.stopPropagation(); setZoom(zoom + 0.35, true); };
  modal.querySelector('#lb-zoom-out').onclick = (e) => { e.stopPropagation(); setZoom(zoom - 0.35, true); };
  modal.querySelector('#lb-zoom-reset').onclick = (e) => { e.stopPropagation(); panX = 0; panY = 0; setZoom(1.0, true); };

  // If SVG, wire custom download button to trigger high-res export
  if (isSvg && options.triggerBtn) {
    const dlBtn = modal.querySelector('#lb-download-btn');
    if (dlBtn) {
      dlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadDiagram(options.triggerBtn);
      };
    }
  }

  // Mouse Drag / Pointer Pan (Zero Lag)
  viewport.onpointerdown = (e) => {
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    if (transformBox) transformBox.style.transition = 'none';
    viewport.setPointerCapture(e.pointerId);
    viewport.style.cursor = 'grabbing';
  };

  viewport.onpointermove = (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  };

  viewport.onpointerup = (e) => {
    isDragging = false;
    try { viewport.releasePointerCapture(e.pointerId); } catch(err) {}
    viewport.style.cursor = zoom > 1 ? 'grab' : 'default';
  };

  viewport.onpointercancel = viewport.onpointerup;

  // Mouse Wheel to Zoom
  viewport.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom(zoom + delta, false);
  };

  // Touch Pinch-to-Zoom (Smooth 60fps)
  viewport.ontouchstart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist = Math.hypot(dx, dy);
      touchStartZoom = zoom;
      if (transformBox) transformBox.style.transition = 'none';
    }
  };

  viewport.ontouchmove = (e) => {
    if (e.touches.length === 2 && touchStartDist > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchStartDist;
      zoom = Math.max(0.5, Math.min(5.0, touchStartZoom * factor));
      updateTransform();
    }
  };

  // Close Handlers
  const closeModal = () => {
    modal.remove();
    window.removeEventListener('keydown', handleKey);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.25, true);
    if (e.key === '-' || e.key === '_') setZoom(zoom - 0.25, true);
  };
  window.addEventListener('keydown', handleKey);

  modal.querySelector('#close-lightbox-btn').onclick = closeModal;
}

export function openDiagramLightbox(buttonEl) {
  const wrapper = buttonEl.closest('.mermaid-block-wrapper');
  if (!wrapper) return;
  const svgEl = wrapper.querySelector('.mermaid svg');
  if (!svgEl) {
    window.toast('Diagram is still rendering, please wait…');
    return;
  }

  try {
    const isDark = document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark') || window.State?.theme === 'dark';
    const clone = svgEl.cloneNode(true);

    // CRITICAL: Preserve SVG id so Mermaid's embedded scoped <style> rules continue to match!
    if (svgEl.id) {
      clone.setAttribute('id', svgEl.id);
    }
    clone.style.maxWidth = '100%';
    clone.style.height = 'auto';
    clone.style.display = 'block';

    // Apply explicit high-contrast fill and border on all flowchart nodes so they never default to black
    const nodeFill = isDark ? '#1e293b' : '#eff6ff';
    const nodeStroke = isDark ? '#60a5fa' : '#2563eb';
    const textColor = isDark ? '#f8fafc' : '#0f172a';

    clone.querySelectorAll('.node rect, .node polygon, .node circle, .node path').forEach(shape => {
      shape.setAttribute('fill', nodeFill);
      shape.setAttribute('stroke', nodeStroke);
      shape.setAttribute('stroke-width', '1.5');
      shape.style.fill = nodeFill;
      shape.style.stroke = nodeStroke;
    });

    clone.querySelectorAll('.node text, .node span, .node div, .label text').forEach(txt => {
      txt.setAttribute('fill', textColor);
      txt.style.color = textColor;
      txt.style.fill = textColor;
      txt.style.fontWeight = '600';
    });

    const serializer = new XMLSerializer();
    let svgSource = serializer.serializeToString(clone);
    if (!svgSource.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgSource = svgSource.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    openImageLightbox('', 'Interactive Academic Flowchart', {
      isSvg: true,
      svgHtml: svgSource,
      triggerBtn: buttonEl
    });
  } catch (err) {
    console.warn('Failed to open diagram lightbox:', err);
    window.toast('Could not open diagram viewer.');
  }
}

export function downloadDiagram(buttonEl) {
  const wrapper = buttonEl.closest('.mermaid-block-wrapper');
  if (!wrapper) return;
  const svgEl = wrapper.querySelector('.mermaid svg');
  if (!svgEl) {
    window.toast('Diagram is still generating…');
    return;
  }

  try {
    const serializer = new XMLSerializer();
    let svgSource = serializer.serializeToString(svgEl);
    if (!svgSource.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgSource = svgSource.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const img = new Image();
    const svgBlob = new Blob([svgSource], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const bbox = svgEl.getBoundingClientRect();
        const scale = 2.5; // High definition export
        canvas.width = (bbox.width || 800) * scale;
        canvas.height = (bbox.height || 500) * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Fill background for crisp contrast
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.download = 'academic-flowchart.png';
          a.href = pngUrl;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.toast('Flowchart downloaded as HD Image! 📊');
        }
      } catch (canvasErr) {
        // Fallback: download SVG directly
        const a = document.createElement('a');
        a.download = 'academic-flowchart.svg';
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.toast('Flowchart downloaded as SVG! 📊');
      }
    };
    img.src = url;
  } catch (err) {
    console.warn('Download diagram error:', err);
    window.toast('Failed to download flowchart image.');
  }
}

// Bind to window for global availability
window.toast = toast;
window.Sheet = Sheet;
window.Modal = Sheet; // Safety alias for modals and bottom sheets
window.copyToClipboard = copyToClipboard;
window.stripMarkdown = stripMarkdown;
window.renderMarkdown = renderMarkdown;
window.formatMarkdown = renderMarkdown; // Alias for safe markdown rendering across all views
window.renderMermaidDiagrams = renderMermaidDiagrams;
window.renderMathFormulas = renderMathFormulas;
window.openImageLightbox = openImageLightbox;
window.openDiagramLightbox = openDiagramLightbox;
window.downloadDiagram = downloadDiagram;
window.debounce = debounce;
window.throttle = throttle;
window.escapeHtml = escapeHtml;
window.positionBottomBar = positionBottomBar;
window.keepBottomBarPositioned = keepBottomBarPositioned;
window.getReadingStats = getReadingStats;
window.startReadingSession = startReadingSession;
window.stopReadingSession = stopReadingSession;

// Robust Multi-tier Fallback for Educational Visual Cards
export function handleCardImageFallback(imgEl, originalUrl, altText) {
  if (!imgEl) return;
  const step = parseInt(imgEl.dataset.fallbackStep || '0', 10);

  if (step === 0) {
    // Stage 1: If proxied URL failed, attempt direct load (if not already tried)
    imgEl.dataset.fallbackStep = '1';
    if (originalUrl && originalUrl.startsWith('http') && imgEl.src !== originalUrl) {
      imgEl.src = originalUrl;
      return;
    }
  }

  if (step <= 1) {
    // Stage 2: Fallback query via backend proxy using clean subject
    imgEl.dataset.fallbackStep = '2';
    const cleanSubject = encodeURIComponent(altText || 'educational visual');
    imgEl.src = `/api/image-proxy?subject=${cleanSubject}&fallback=1&t=${Date.now()}`;
    return;
  }

  // Stage 3: All network sources exhausted - gracefully render elegant academic SVG card
  imgEl.dataset.fallbackStep = '3';
  imgEl.style.display = 'none';
  const container = imgEl.parentElement;
  if (container && !container.querySelector('.image-fallback-badge')) {
    const fb = document.createElement('div');
    fb.className = 'image-fallback-badge';
    fb.style.cssText = 'padding:24px 16px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:var(--text);';
    fb.innerHTML = `
      <div style="font-size:36px; line-height:1;">🖼️</div>
      <div style="font-size:14px; font-weight:700; color:var(--text);">${escapeHtml(altText || 'Educational Archive')}</div>
      <div style="font-size:12px; color:var(--text-muted, #64748b);">Authentic Reference Visual</div>
      <button class="btn" onclick="const im = this.closest('.ai-generated-visual-card')?.querySelector('img'); if(im){ im.dataset.fallbackStep='0'; im.style.display='block'; im.src='/api/image-proxy?subject=${encodeURIComponent(altText)}&t=' + Date.now(); this.parentElement.remove(); }" style="margin-top:4px; height:28px; padding:0 12px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--accent-soft); border:1px solid var(--accent); color:var(--accent); cursor:pointer;">
        🔄 Reload Image
      </button>
    `;
    container.appendChild(fb);
  }
}
window.handleCardImageFallback = handleCardImageFallback;
