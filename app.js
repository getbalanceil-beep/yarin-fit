// Yarin Fit — Apple Health / Notion Warm Editorial Edition

let appData = {
  startWeight: 70.0,
  startDate: "20/07/2025",
  weightEntries: [],
  weeklyForecasts: [],
  workouts: [],
  measurements: [],
  nutrition: [],
  creatineLogs: []
};

let currentChartRange = '30d';
let weightChartInstance = null;
let measurementChartInstance = null;
let selectedMeasurementIdx = 0;
let selectedWorkoutDay = 'A';
let selectedNutritionType = 'train';

const BODY_PARTS = [
  { key: "אמה", dual: true },
  { key: "יד קדמית", dual: true },
  { key: "מותן קו טבור", dual: false },
  { key: "ישבן", dual: false },
  { key: "קו כתפיים", dual: false },
  { key: "תאומים גבוה", dual: true },
  { key: "תאומים נמוך", dual: true },
  { key: "ירך נמוך", dual: true },
  { key: "ירך גבוה", dual: true }
];

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoToDisplayDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function getCurrentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toastText');
  text.textContent = msg;
  toast.classList.remove('opacity-0', 'translate-y-[-10px]', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-[-10px]', 'pointer-events-none');
  }, 2600);
}

function getCloudWebhookUrl() {
  return localStorage.getItem('yarin_cloud_webhook') || '';
}

function saveCloudWebhook() {
  const val = document.getElementById('cloudWebhookInput').value.trim();
  localStorage.setItem('yarin_cloud_webhook', val);
  showToast(val ? 'חיבור הענן נשמר!' : 'חיבור הענן הוסר');
}

async function syncToCloudOrLocal(endpoint, payload) {
  // 1. Try local Mac server first (if on home Wi-Fi / Mac)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const out = await res.json();
      if (out.synced) return { synced: true, via: 'local' };
    }
  } catch (e) {}

  // 2. Try Google Apps Script Cloud Webhook (works anywhere on 5G/abroad)
  const webhook = getCloudWebhookUrl();
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ endpoint, ...payload })
      });
      return { synced: true, via: 'cloud' };
    } catch (e) {}
  }
  return { synced: false };
}

async function initApp() {
  lucide.createIcons();

  const savedWebhook = getCloudWebhookUrl();
  const webhookInput = document.getElementById('cloudWebhookInput');
  if (webhookInput && savedWebhook) webhookInput.value = savedWebhook;

  // Load from server or static data.json, merge with local changes
  let baseData = null;
  try {
    const res = await fetch('./api/data');
    if (res.ok) baseData = await res.json();
  } catch (err) {
    try {
      const res2 = await fetch('./data.json');
      if (res2.ok) baseData = await res2.json();
    } catch (e2) {}
  }
  if (!baseData) {
    try {
      const res3 = await fetch('./data.json');
      if (res3.ok) baseData = await res3.json();
    } catch (e3) {}
  }

  const cachedStr = localStorage.getItem('yarin_fit_backup_v2');
  if (baseData && cachedStr) {
    const cached = JSON.parse(cachedStr);
    // Keep whichever has more recent weight entries
    appData = baseData;
    (cached.weightEntries || []).forEach(ce => {
      if (ce.weight !== null && ce.weight !== undefined) {
        const match = appData.weightEntries.find(be => be.isoDate === ce.isoDate);
        if (match) {
          match.weight = ce.weight;
          match.time = ce.time || match.time;
          match.note = ce.note || match.note;
        } else {
          appData.weightEntries.push(ce);
        }
      }
    });
    appData.weightEntries.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  } else if (baseData) {
    appData = baseData;
  } else if (cachedStr) {
    appData = JSON.parse(cachedStr);
  }

  localStorage.setItem('yarin_fit_backup_v2', JSON.stringify(appData));

  const todayIso = getTodayIso();
  document.getElementById('logDateInput').value = todayIso;
  document.getElementById('logTimeInput').value = getCurrentTimeStr();

  selectedMeasurementIdx = Math.max(0, (appData.measurements || []).length - 1);

  populateDateLogForm(todayIso);
  renderAll();
}

function renderAll() {
  renderKPIsAndSummary();
  renderWeightChart();
  renderWeightHistory();
  renderMeasurementsTab();
  renderWorkoutsTab();
  renderNutritionTab();
  lucide.createIcons();
}

// ==================== WEIGHT TRACKER LOGIC ====================

function getFilledWeightEntries() {
  return (appData.weightEntries || [])
    .filter(e => e.weight !== null && e.weight !== undefined && !isNaN(e.weight))
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

function populateDateLogForm(isoDate) {
  const existing = (appData.weightEntries || []).find(e => e.isoDate === isoDate);
  const filled = getFilledWeightEntries();
  const lastEntry = filled.length > 0 ? filled[filled.length - 1] : { weight: 78.5 };

  const weightInput = document.getElementById('logWeightInput');
  const timeInput = document.getElementById('logTimeInput');
  const noteInput = document.getElementById('logNoteInput');
  const badge = document.getElementById('logDayDiffBadge');

  if (existing && existing.weight !== null) {
    weightInput.value = Number(existing.weight).toFixed(1);
    timeInput.value = existing.time || getCurrentTimeStr();
    noteInput.value = existing.note || '';
    badge.textContent = `שקילה שמורה ל-${existing.date}`;
    badge.className = 'text-[11px] text-[#2D5A43] font-bold';
  } else {
    weightInput.value = Number(lastEntry.weight).toFixed(1);
    timeInput.value = getCurrentTimeStr();
    noteInput.value = existing ? (existing.note || '') : '';
    badge.textContent = `טרם הוזן ל-${isoToDisplayDate(isoDate)} • מציג שקילה אחרונה`;
    badge.className = 'text-[11px] text-[#78756E] font-medium';
  }
}

function onDateChange() {
  const iso = document.getElementById('logDateInput').value;
  populateDateLogForm(iso);
}

function shiftSelectedDate(days) {
  const input = document.getElementById('logDateInput');
  const curr = new Date(input.value || getTodayIso());
  curr.setDate(curr.getDate() + days);
  const iso = curr.toISOString().slice(0, 10);
  input.value = iso;
  populateDateLogForm(iso);
}

function stepWeight(delta) {
  const input = document.getElementById('logWeightInput');
  const curr = parseFloat(input.value) || 78.5;
  const next = Math.round((curr + delta) * 10) / 10;
  input.value = next.toFixed(1);
}

function setToYesterdayWeight() {
  const filled = getFilledWeightEntries();
  if (filled.length > 0) {
    const prev = filled[filled.length - 1].weight;
    document.getElementById('logWeightInput').value = Number(prev).toFixed(1);
  }
}

async function saveDailyWeight() {
  const isoDate = document.getElementById('logDateInput').value || getTodayIso();
  const dateStr = isoToDisplayDate(isoDate);
  const timeStr = document.getElementById('logTimeInput').value || getCurrentTimeStr();
  const weightVal = parseFloat(document.getElementById('logWeightInput').value);
  const noteStr = document.getElementById('logNoteInput').value.trim();

  if (isNaN(weightVal) || weightVal < 30 || weightVal > 200) {
    showToast('נא להזין משקל תקין');
    return;
  }

  const btn = document.getElementById('saveWeightBtn');
  btn.disabled = true;
  btn.innerHTML = `<span>שומר...</span>`;

  let entry = (appData.weightEntries || []).find(e => e.isoDate === isoDate);
  if (entry) {
    entry.weight = weightVal;
    entry.time = timeStr;
    entry.note = noteStr;
  } else {
    entry = {
      date: dateStr,
      isoDate,
      time: timeStr,
      weight: weightVal,
      weekTag: '',
      note: noteStr
    };
    appData.weightEntries.push(entry);
    appData.weightEntries.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  }
  localStorage.setItem('yarin_fit_backup_v2', JSON.stringify(appData));

  const res = await syncToCloudOrLocal('/api/weight', {
    isoDate, date: dateStr, time: timeStr, weight: weightVal, note: noteStr
  });

  if (res.synced) {
    showToast(`נשמר (${weightVal} ק״ג) וגובה ל-Google Sheets`);
  } else {
    showToast(`נשמר במכשיר (${weightVal} ק״ג)`);
  }

  btn.disabled = false;
  btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>שמור שקילה</span>`;
  populateDateLogForm(isoDate);
  renderAll();
}

function renderKPIsAndSummary() {
  const filled = getFilledWeightEntries();
  if (filled.length === 0) return;

  const latest = filled[filled.length - 1];
  const startWeight = appData.startWeight || 70.0;
  const totalGain = latest.weight - startWeight;

  document.getElementById('kpiCurrentWeight').textContent = latest.weight.toFixed(1);
  const gainEl = document.getElementById('kpiTotalGain');
  gainEl.textContent = `${totalGain >= 0 ? '+' : ''}${totalGain.toFixed(1)} ק״ג מההתחלה`;
  gainEl.className = `mt-1 text-[11px] font-bold ${totalGain >= 0 ? 'text-[#2D5A43]' : 'text-[#D96B43]'}`;

  const last7 = filled.slice(-7);
  const prev7 = filled.slice(-14, -7);
  const avg7 = last7.reduce((acc, x) => acc + x.weight, 0) / last7.length;
  const prevAvg7 = prev7.length > 0 ? prev7.reduce((acc, x) => acc + x.weight, 0) / prev7.length : avg7;
  const diff7 = avg7 - prevAvg7;

  document.getElementById('kpiWeeklyAvg').textContent = avg7.toFixed(2);
  const diffEl = document.getElementById('kpiWeeklyDiff');
  diffEl.textContent = `${diff7 >= 0 ? '+' : ''}${diff7.toFixed(2)} משבוע שעבר`;
  diffEl.className = `mt-1 text-[11px] font-semibold ${diff7 >= 0 ? 'text-[#2D5A43]' : 'text-[#78756E]'}`;

  const forecasts = appData.weeklyForecasts || [];
  const startMs = new Date('2025-07-20').getTime();
  const latestMs = new Date(latest.isoDate).getTime();
  const currentWeekNum = Math.max(1, Math.floor((latestMs - startMs) / (7 * 24 * 3600 * 1000)) + 1);
  document.getElementById('currentWeekBadge').textContent = `שבוע ${currentWeekNum}`;

  const weekForecastObj = forecasts.find(f => f.week === currentWeekNum) || forecasts[forecasts.length - 1];
  if (weekForecastObj && weekForecastObj.forecast) {
    document.getElementById('kpiForecastWeight').textContent = weekForecastObj.forecast.toFixed(2);
    const diffTarget = avg7 - weekForecastObj.forecast;
    const statusEl = document.getElementById('kpiForecastStatus');
    statusEl.textContent = `פער: ${diffTarget >= 0 ? '+' : ''}${diffTarget.toFixed(2)} ק״ג`;
    statusEl.className = `mt-1 text-[11px] font-bold ${Math.abs(diffTarget) <= 0.7 ? 'text-[#2D5A43]' : 'text-[#D96B43]'}`;
  }

  const strip = document.getElementById('weeklySummaryStrip');
  const recentWeeks = forecasts.slice(-16).reverse();
  strip.innerHTML = recentWeeks.map(w => {
    const actual = w.week === currentWeekNum ? avg7 : w.sheetActual;
    const forecast = w.forecast;
    const diff = (actual && forecast) ? (actual - forecast) : null;
    const isCurrent = w.week === currentWeekNum;
    return `
      <div class="shrink-0 w-28 rounded-2xl p-3 border transition ${isCurrent ? 'bg-[#EAF1ED]/60 border-[#2D5A43]/30' : 'bg-[#F8F7F3] border-[#EAE8E1]'}">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold ${isCurrent ? 'text-[#2D5A43]' : 'text-[#78756E]'}">שבוע ${w.week}</span>
          ${isCurrent ? '<span class="w-1.5 h-1.5 rounded-full bg-[#2D5A43]"></span>' : ''}
        </div>
        <div class="my-1.5">
          <div class="num-font text-base font-extrabold text-[#1C1B18]">${actual ? actual.toFixed(2) : '--'}</div>
          <div class="text-[10px] text-[#78756E]">תחזית: ${forecast ? forecast.toFixed(2) : '--'}</div>
        </div>
        <div class="num-font text-[10px] font-bold ${diff !== null && diff >= -0.5 ? 'text-[#2D5A43]' : 'text-[#D96B43]'}">
          ${diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} ק״ג` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function setChartRange(range) {
  currentChartRange = range;
  ['14d', '30d', '90d', 'all'].forEach(r => {
    const btn = document.getElementById(`range-${r}`);
    if (r === range) {
      btn.className = 'px-2.5 py-1 rounded-lg bg-white text-[#1C1B18] shadow-sm transition';
    } else {
      btn.className = 'px-2.5 py-1 rounded-lg text-[#78756E] transition';
    }
  });
  renderWeightChart();
}

function renderWeightChart() {
  const filled = getFilledWeightEntries();
  if (filled.length === 0) return;

  let sliceCount = filled.length;
  if (currentChartRange === '14d') sliceCount = 14;
  else if (currentChartRange === '30d') sliceCount = 30;
  else if (currentChartRange === '90d') sliceCount = 90;

  const dataSlice = filled.slice(-sliceCount);
  const labels = dataSlice.map(e => e.date.slice(0, 5));
  const weights = dataSlice.map(e => e.weight);

  const movingAvg = dataSlice.map(entry => {
    const globalIdx = filled.indexOf(entry);
    const windowEntries = filled.slice(Math.max(0, globalIdx - 6), globalIdx + 1);
    const sum = windowEntries.reduce((s, x) => s + x.weight, 0);
    return Number((sum / windowEntries.length).toFixed(2));
  });

  const ctx = document.getElementById('weightChart').getContext('2d');
  if (weightChartInstance) weightChartInstance.destroy();

  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(45, 90, 67, 0.16)');
  grad.addColorStop(1, 'rgba(45, 90, 67, 0.0)');

  weightChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'משקל יומי',
          data: weights,
          borderColor: '#2D5A43',
          backgroundColor: grad,
          borderWidth: 2.5,
          pointRadius: currentChartRange === 'all' ? 0 : 3,
          pointBackgroundColor: '#2D5A43',
          tension: 0.35,
          fill: true
        },
        {
          label: 'ממוצע 7 ימים',
          data: movingAvg,
          borderColor: '#D96B43',
          borderDash: [5, 4],
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1C1B18',
          titleFont: { family: 'Assistant', size: 12 },
          bodyFont: { family: 'Assistant', size: 12 },
          padding: 10,
          cornerRadius: 12
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9A978F', font: { family: 'Plus Jakarta Sans', size: 10 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: '#F0EFEA' },
          ticks: { color: '#78756E', font: { family: 'Plus Jakarta Sans', size: 11 } }
        }
      }
    }
  });
}

function renderWeightHistory() {
  const query = (document.getElementById('historySearchInput').value || '').trim().toLowerCase();
  const filled = getFilledWeightEntries().slice().reverse();

  const filtered = filled.filter(e => {
    if (!query) return true;
    return (e.date && e.date.includes(query)) ||
           (e.note && e.note.toLowerCase().includes(query)) ||
           (e.weekTag && e.weekTag.toLowerCase().includes(query)) ||
           String(e.weight).includes(query);
  }).slice(0, 60);

  const container = document.getElementById('weightHistoryList');
  container.innerHTML = filtered.map((e, i) => {
    const prev = filtered[i + 1];
    const diff = prev ? (e.weight - prev.weight) : 0;
    const diffStr = prev ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}` : '';
    return `
      <div onclick="selectHistoryDate('${e.isoDate}')" class="py-3 flex items-center justify-between cursor-pointer hover:bg-[#FAF9F6] px-2 rounded-xl transition">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl subtle-pill flex flex-col items-center justify-center">
            <span class="num-font text-xs font-extrabold text-[#1C1B18]">${e.date.slice(0, 5)}</span>
            <span class="num-font text-[9px] text-[#78756E]">${e.date.slice(6)}</span>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="num-font text-base font-extrabold text-[#1C1B18]">${e.weight.toFixed(1)} <span class="text-xs font-normal text-[#78756E]">ק״ג</span></span>
              ${e.weekTag ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-[#EAF1ED] text-[#2D5A43] font-bold">${e.weekTag}</span>` : ''}
            </div>
            <div class="text-[11px] text-[#78756E] flex items-center gap-2">
              ${e.time ? `<span class="num-font">${e.time}</span>` : ''}
              ${e.note ? `<span class="text-[#D96B43] font-semibold">• ${e.note}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="num-font text-xs font-bold ${diff > 0 ? 'text-[#2D5A43]' : diff < 0 ? 'text-[#D96B43]' : 'text-[#9A978F]'}">
          ${diffStr}
        </div>
      </div>
    `;
  }).join('');
}

function selectHistoryDate(isoDate) {
  document.getElementById('logDateInput').value = isoDate;
  populateDateLogForm(isoDate);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== TAB 2: MEASUREMENTS ====================

function renderMeasurementsTab() {
  const list = appData.measurements || [];
  if (list.length === 0) return;

  const pillsContainer = document.getElementById('measurementDatePills');
  pillsContainer.innerHTML = list.map((m, idx) => `
    <button onclick="selectMeasurementDate(${idx})" class="num-font shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${idx === selectedMeasurementIdx ? 'sage-btn' : 'subtle-pill text-[#57544E]'}">
      ${m.date}
    </button>
  `).join('');

  const current = list[selectedMeasurementIdx] || list[list.length - 1];
  const prev = selectedMeasurementIdx > 0 ? list[selectedMeasurementIdx - 1] : null;

  const grid = document.getElementById('measurementsGrid');
  grid.innerHTML = BODY_PARTS.map(part => {
    const val = (current.items || {})[part.key];
    if (!val || (val.right === null && val.left === null)) return '';
    const prevVal = prev && prev.items ? prev.items[part.key] : null;

    let diffBadge = '';
    if (prevVal && prevVal.right && val.right) {
      const diff = val.right - prevVal.right;
      const pct = ((diff / prevVal.right) * 100).toFixed(1);
      diffBadge = `<span class="num-font text-[11px] font-bold px-2.5 py-1 rounded-full ${diff >= 0 ? 'bg-[#EAF1ED] text-[#2D5A43]' : 'bg-[#FDF0EB] text-[#D96B43]'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)} ס״מ (${diff >= 0 ? '+' : ''}${pct}%)</span>`;
    }

    return `
      <div class="py-3.5 flex items-center justify-between">
        <div>
          <div class="font-bold text-sm text-[#1C1B18]">${part.key}</div>
          <div class="text-xs text-[#78756E] mt-0.5">
            ${part.dual
              ? `ימין: <strong class="num-font text-[#1C1B18]">${val.right ?? '-'}</strong> ס״מ &nbsp;•&nbsp; שמאל: <strong class="num-font text-[#1C1B18]">${val.left ?? '-'}</strong> ס״מ`
              : `היקף: <strong class="num-font text-[#1C1B18]">${val.right ?? '-'}</strong> ס״מ`
            }
          </div>
        </div>
        <div>${diffBadge}</div>
      </div>
    `;
  }).join('');

  renderMeasurementChart();
}

function selectMeasurementDate(idx) {
  selectedMeasurementIdx = idx;
  renderMeasurementsTab();
}

function renderMeasurementChart() {
  const list = appData.measurements || [];
  if (list.length === 0) return;

  const partKey = document.getElementById('measChartSelect').value;
  const labels = list.map(m => m.date.slice(0, 5));
  const rightData = list.map(m => (m.items && m.items[partKey]) ? m.items[partKey].right : null);
  const leftData = list.map(m => (m.items && m.items[partKey]) ? m.items[partKey].left : null);

  const ctx = document.getElementById('measurementChart').getContext('2d');
  if (measurementChartInstance) measurementChartInstance.destroy();

  const datasets = [
    {
      label: 'ימין / מרכז (ס״מ)',
      data: rightData,
      borderColor: '#2D5A43',
      backgroundColor: 'rgba(45, 90, 67, 0.15)',
      borderWidth: 2.5,
      tension: 0.3
    }
  ];

  if (leftData.some(x => x !== null && x !== undefined)) {
    datasets.push({
      label: 'שמאל (ס״מ)',
      data: leftData,
      borderColor: '#D96B43',
      backgroundColor: 'rgba(217, 107, 67, 0.15)',
      borderWidth: 2.5,
      tension: 0.3
    });
  }

  measurementChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#57544E', font: { family: 'Assistant', size: 11 } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#78756E' } },
        y: { grid: { color: '#F0EFEA' }, ticks: { color: '#78756E' } }
      }
    }
  });
}

function openNewMeasurementModal() {
  document.getElementById('newMeasDate').value = getTodayIso();
  const list = appData.measurements || [];
  const latest = list.length > 0 ? list[list.length - 1].items : {};

  const container = document.getElementById('newMeasFields');
  container.innerHTML = BODY_PARTS.map((p, idx) => {
    const prev = latest[p.key] || {};
    return `
      <div class="subtle-pill rounded-xl p-2.5 flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-[#1C1B18] w-28">${p.key}</span>
        ${p.dual ? `
          <div class="flex items-center gap-2 flex-1">
            <input type="number" step="0.1" id="meas-r-${idx}" placeholder="ימין" value="${prev.right ?? ''}" class="num-font w-full bg-white border border-[#E5E3DC] rounded-lg px-2 py-1.5 text-xs text-center font-bold text-[#1C1B18]" />
            <input type="number" step="0.1" id="meas-l-${idx}" placeholder="שמאל" value="${prev.left ?? ''}" class="num-font w-full bg-white border border-[#E5E3DC] rounded-lg px-2 py-1.5 text-xs text-center font-bold text-[#1C1B18]" />
          </div>
        ` : `
          <div class="flex-1">
            <input type="number" step="0.1" id="meas-r-${idx}" placeholder="ס״מ" value="${prev.right ?? ''}" class="num-font w-full bg-white border border-[#E5E3DC] rounded-lg px-2 py-1.5 text-xs text-center font-bold text-[#1C1B18]" />
          </div>
        `}
      </div>
    `;
  }).join('');

  const modal = document.getElementById('measurementModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeNewMeasurementModal() {
  const modal = document.getElementById('measurementModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function saveNewMeasurement() {
  const isoDate = document.getElementById('newMeasDate').value || getTodayIso();
  const dateStr = isoToDisplayDate(isoDate);
  const items = {};

  BODY_PARTS.forEach((p, idx) => {
    const rEl = document.getElementById(`meas-r-${idx}`);
    const lEl = document.getElementById(`meas-l-${idx}`);
    const rVal = rEl && rEl.value ? parseFloat(rEl.value) : null;
    const lVal = lEl && lEl.value ? parseFloat(lEl.value) : null;
    items[p.key] = { right: rVal, left: p.dual ? lVal : null };
  });

  const measurement = { date: dateStr, isoDate, items };
  appData.measurements.push(measurement);
  appData.measurements.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  selectedMeasurementIdx = appData.measurements.length - 1;
  localStorage.setItem('yarin_fit_backup_v2', JSON.stringify(appData));

  await syncToCloudOrLocal('/api/measurement', { measurement });

  closeNewMeasurementModal();
  renderMeasurementsTab();
  showToast('מדידת היקפים נשמרה');
}

// ==================== TAB 3: WORKOUTS ====================

function setWorkoutDay(day) {
  selectedWorkoutDay = day;
  document.getElementById('btn-day-A').className = day === 'A'
    ? 'px-4 py-1.5 rounded-lg bg-white text-[#1C1B18] shadow-sm transition'
    : 'px-4 py-1.5 rounded-lg text-[#78756E] transition';
  document.getElementById('btn-day-B').className = day === 'B'
    ? 'px-4 py-1.5 rounded-lg bg-white text-[#1C1B18] shadow-sm transition'
    : 'px-4 py-1.5 rounded-lg text-[#78756E] transition';
  renderWorkoutsTab();
}

function renderWorkoutsTab() {
  const list = (appData.workouts || []).filter(w => (w.day || 'A') === selectedWorkoutDay);
  const container = document.getElementById('workoutExercisesList');

  container.innerHTML = list.map(w => `
    <div class="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 space-y-2.5">
      <div class="flex items-start justify-between gap-2">
        <div>
          <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#EAF1ED] text-[#2D5A43]">${w.muscle}</span>
          <h4 class="font-bold text-base text-[#1C1B18] mt-1">${w.exercise}</h4>
        </div>
        <div class="flex flex-col items-end">
          <span class="text-[10px] font-semibold text-[#78756E] mb-1">משקל עבודה (ק״ג)</span>
          <input type="number" step="0.5" value="${w.currentWeight || ''}" placeholder="--"
            onchange="updateExerciseWeight('${w.id}', this.value)"
            class="num-font w-16 bg-white border border-[#D8D5CD] rounded-xl px-2 py-1.5 text-center font-extrabold text-sm text-[#2D5A43] focus:outline-none focus:border-[#2D5A43]" />
        </div>
      </div>

      <div class="flex items-center gap-3 text-xs text-[#57544E] subtle-pill rounded-xl px-3 py-2">
        <div><span class="text-[#78756E]">סטים:</span> <strong class="num-font text-[#1C1B18]">${w.sets || '-'}</strong></div>
        <div class="text-[#D8D5CD]">•</div>
        <div><span class="text-[#78756E]">חזרות:</span> <strong class="num-font text-[#1C1B18]">${w.reps || '-'}</strong></div>
        <div class="text-[#D8D5CD]">•</div>
        <div><span class="text-[#78756E]">RIR:</span> <strong class="num-font text-[#1C1B18]">${w.rir || '-'}</strong></div>
      </div>

      ${w.description || w.cues ? `
        <div class="text-[11px] text-[#57544E] space-y-1 leading-relaxed">
          ${w.description ? `<div>${w.description}</div>` : ''}
          ${w.cues ? `<div class="text-[#2D5A43] font-semibold">דגשים: ${w.cues}</div>` : ''}
        </div>
      ` : ''}

      ${w.history && w.history.length > 0 ? `
        <div class="flex items-center gap-1.5 flex-wrap pt-1">
          <span class="text-[10px] text-[#78756E]">היסטוריה:</span>
          ${w.history.map(h => `<span class="num-font text-[10px] px-2 py-0.5 rounded-full subtle-pill text-[#57544E] font-semibold">${h} ק״ג</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function updateExerciseWeight(id, newWeight) {
  const ex = (appData.workouts || []).find(w => w.id === id);
  if (!ex) return;
  if (ex.currentWeight && String(ex.currentWeight) !== String(newWeight)) {
    ex.history = ex.history || [];
    ex.history.push(String(ex.currentWeight));
  }
  ex.currentWeight = newWeight;
  localStorage.setItem('yarin_fit_backup_v2', JSON.stringify(appData));

  const res = await syncToCloudOrLocal('/api/workout', { id, currentWeight: newWeight });
  showToast(res.synced ? `עודכן (${newWeight} ק״ג) וסונכרן` : `עודכן (${newWeight} ק״ג)`);
  renderWorkoutsTab();
}

// ==================== TAB 4: NUTRITION & CREATINE ====================

function setNutritionDayType(type) {
  selectedNutritionType = type;
  document.getElementById('btn-nut-train').className = type === 'train'
    ? 'px-3 py-1.5 rounded-lg bg-white text-[#1C1B18] shadow-sm transition'
    : 'px-3 py-1.5 rounded-lg text-[#78756E] transition';
  document.getElementById('btn-nut-rest').className = type === 'rest'
    ? 'px-3 py-1.5 rounded-lg bg-white text-[#1C1B18] shadow-sm transition'
    : 'px-3 py-1.5 rounded-lg text-[#78756E] transition';

  const summary = document.getElementById('nutritionMacrosSummary');
  if (type === 'train') {
    summary.textContent = 'יום אימון: ~3,000 קק״ל • 165 ג׳ חלבון • 430 ג׳ פחמימה';
  } else {
    summary.textContent = 'יום מנוחה: ~2,056 קק״ל • 135 ג׳ חלבון • 350 ג׳ פחמימה';
  }
  renderNutritionTab();
}

function renderNutritionTab() {
  const todayStr = isoToDisplayDate(getTodayIso());
  const logs = appData.creatineLogs || [];
  const tookToday = logs.some(c => c.date === todayStr && c.grams > 0);

  const btn = document.getElementById('creatineCheckBtn');
  const sub = document.getElementById('creatineSubtitle');
  if (tookToday) {
    btn.className = 'px-4 py-2.5 rounded-xl font-bold text-xs sage-btn flex items-center gap-1.5';
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>נלקח היום</span>`;
    sub.textContent = `סומן להיום (${todayStr})`;
  } else {
    btn.className = 'px-4 py-2.5 rounded-xl font-bold text-xs subtle-pill text-[#1C1B18] flex items-center gap-1.5';
    btn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i><span>סמן לקיחה</span>`;
    sub.textContent = `מנת תחזוקה יומית (${todayStr})`;
  }

  const meals = appData.nutrition || [];
  const container = document.getElementById('nutritionMealsList');
  container.innerHTML = meals.map(m => {
    const title = selectedNutritionType === 'train' ? m.trainDay : m.restDay;
    return `
      <div class="py-3.5 space-y-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="num-font text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-[#EAF1ED] text-[#2D5A43]">${m.time}</span>
            <h4 class="font-bold text-sm text-[#1C1B18]">${m.name}</h4>
          </div>
          ${m.calories !== '-' ? `<span class="num-font text-[11px] font-bold text-[#D96B43]">${m.calories} קק״ל • ${m.protein} חלבון</span>` : ''}
        </div>
        <div class="text-xs font-bold text-[#1C1B18] pt-0.5">${title}</div>
        <div class="text-[11px] text-[#78756E] leading-relaxed">${m.details}</div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

async function toggleTodayCreatine() {
  const todayStr = isoToDisplayDate(getTodayIso());
  const logs = appData.creatineLogs || [];
  const existing = logs.find(c => c.date === todayStr);
  const nextGrams = (existing && existing.grams > 0) ? 0 : 5;

  if (existing) {
    existing.grams = nextGrams;
  } else {
    logs.push({ date: todayStr, grams: nextGrams });
  }
  localStorage.setItem('yarin_fit_backup_v2', JSON.stringify(appData));

  await syncToCloudOrLocal('/api/creatine', { date: todayStr, grams: nextGrams });
  renderNutritionTab();
  showToast(nextGrams > 0 ? 'קריאטין יומי סומן' : 'סימון קריאטין בוטל');
}

// ==================== NAVIGATION & MODALS ====================

function switchTab(tabName) {
  ['weight', 'measurements', 'workouts', 'nutrition'].forEach(t => {
    const sec = document.getElementById(`tab-${t}`);
    const nav = document.getElementById(`nav-${t}`);
    if (t === tabName) {
      sec.classList.remove('hidden');
      nav.classList.add('active');
    } else {
      sec.classList.add('hidden');
      nav.classList.remove('active');
    }
  });
  if (tabName === 'weight') renderWeightChart();
  if (tabName === 'measurements') renderMeasurementChart();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function exportDataJson() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yarin-fitness-backup-${getTodayIso()}.json`;
  a.click();
}

window.addEventListener('DOMContentLoaded', initApp);
