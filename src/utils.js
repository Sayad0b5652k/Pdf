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
  s = s.replace(/\\text\{([^}]+)\}/g, '$1');
  s = s.replace(/\\operatorname\{([^}]+)\}/g, '$1');

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

  return s;
}

export function renderMarkdown(raw){
  const sanitized = cleanRawMathAndSymbols(raw || '');
  const lines = sanitized.replace(/\r\n/g,'\n').split('\n');
  let html = '', listType = null, paraBuffer = [];
  let inCodeBlock = false, codeBuffer = [];
  let inTable = false, tableRows = [];

  const inline = (s)=>{
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
  const flushPara = ()=>{
    if(paraBuffer.length){ html += `<p style="margin:0 0 10px; line-height:1.68; font-size:14px; color:var(--text);">${inline(paraBuffer.join(' '))}</p>`; paraBuffer = []; }
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

    // Code block toggle (``` or ```ascii or ```tree)
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre class="no-scrollbar" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; font-family:'Courier New', Consolas, monospace; font-size:12.5px; line-height:1.55; color:var(--text); overflow-x:auto; margin:12px 0; white-space:pre; scrollbar-width:none; -ms-overflow-style:none;"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushPara(); closeList(); flushTable();
        inCodeBlock = true;
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

// Bind to window for global availability
window.toast = toast;
window.Sheet = Sheet;
window.Modal = Sheet; // Safety alias for modals and bottom sheets
window.copyToClipboard = copyToClipboard;
window.stripMarkdown = stripMarkdown;
window.renderMarkdown = renderMarkdown;
window.formatMarkdown = renderMarkdown; // Alias for safe markdown rendering across all views
window.debounce = debounce;
window.throttle = throttle;
window.escapeHtml = escapeHtml;
window.positionBottomBar = positionBottomBar;
window.keepBottomBarPositioned = keepBottomBarPositioned;
window.getReadingStats = getReadingStats;
window.startReadingSession = startReadingSession;
window.stopReadingSession = stopReadingSession;
