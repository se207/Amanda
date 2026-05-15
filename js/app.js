const tabsEl = document.getElementById('tabs');
    const modules = [...document.querySelectorAll('.module')];
    // Paste your deployed Google Apps Script Web App URL here.
    const SHEET_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzMDQhpNLVWygXQq3jGdpWYF5GyxQvnaxZA3t1Y3ZltG2E9RXcu10_6xQoxgNJkF4I8/exec';
    const studentId = `student-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.removeItem('studentAnswerRow');
    const state = {
      current: 0,
      unlocked: 0,
      completed: new Set(),
      env: 'A',
      envDone: new Set(),
      q1Page: 0,
      q1CanAdvance: {},
      q2Answered: false,
      q3ReadyToAdvance: false,
      q4Page: 0,
      q4Choice: {},
      q4AnsweredPages: {},
      q5Answered: false
    };

    const names = ['題目 1', '題目 2', '題目 3', '題目 4', '題目 5'];

    function fmt(n, d = 1) {
      return Number(n).toFixed(d).replace(/\.0$/, '');
    }

    function submitAnswer(question, answer) {
      if (!ensureStudentName()) return;
      const allAnswers = JSON.parse(localStorage.getItem('studentAnswerRow') || '{}');
      allAnswers[question] = answer;
      localStorage.setItem('studentAnswerRow', JSON.stringify(allAnswers));
      const payload = {
        timestamp: new Date().toISOString(),
        studentId,
        studentName: document.getElementById('studentName')?.value.trim() || '',
        answers: allAnswers,
        page: location.pathname
      };
      const pending = JSON.parse(localStorage.getItem('pendingSheetSubmissions') || '[]');
      pending.push(payload);
      localStorage.setItem('pendingSheetSubmissions', JSON.stringify(pending.slice(-100)));
      if (!SHEET_WEB_APP_URL) {
        console.info('Google Sheet URL is not configured. Saved locally:', payload);
        return;
      }
      fetch(SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(payload)
      }).catch(err => console.warn('Sheet submission failed; local copy kept.', err));
    }

    function windwardTemp(h, cloudBase = 1250) {
      if (h <= cloudBase) return 30 - h / 100;
      return (30 - cloudBase / 100) - (h - cloudBase) * 0.006;
    }

    function dewpoint(h, cloudBase = 1250) {
      if (h <= cloudBase) return 20 - h * 0.002;
      return windwardTemp(h, cloudBase);
    }

    function rhFromTempDew(t, td) {
      const es = 6.112 * Math.exp((17.67 * t) / (t + 243.5));
      const e = 6.112 * Math.exp((17.67 * td) / (td + 243.5));
      return Math.min(100, Math.round(e / es * 100));
    }

    function mountainPoint(h, descent = false) {
      const left = {x: 70, y: 332}, bend = {x: 190, y: 332}, top = {x: 430, y: 92}, right = {x: 705, y: 307};
      const p = Math.max(0, Math.min(1, h / 4000));
      if (descent) {
        return {x: top.x + (right.x - top.x) * p, y: top.y + (right.y - top.y) * p};
      }
      return {x: bend.x + (top.x - bend.x) * p, y: bend.y + (top.y - bend.y) * p};
    }

    function q1PointFromDistance(distance) {
      const left = {x: 70, y: 332}, bend = {x: 190, y: 332}, top = {x: 430, y: 92};
      if (distance <= 1000) {
        const k = Math.max(0, distance) / 1000;
        return {x: left.x + (bend.x - left.x) * k, y: left.y};
      }
      const k = Math.max(0, Math.min(1, (distance - 1000) / 4000));
      return {x: bend.x + (top.x - bend.x) * k, y: bend.y + (top.y - bend.y) * k};
    }

    function q1HeightFromDistance(distance) {
      return distance <= 1000 ? 0 : Math.max(0, Math.min(4000, distance - 1000));
    }

    function q1HeightFromPoint(loc) {
      if (loc.x <= 190) {
        const t = (loc.x - 70) / (190 - 70);
        return Math.round(Math.max(0, Math.min(1, t)) * 1000 / 50) * 50;
      }
      const t = (loc.x - 190) / (430 - 190);
      return 1000 + Math.round(Math.max(0, Math.min(1, t)) * 4000 / 50) * 50;
    }

    function foehnPoint(distance) {
      const left = {x: 110, y: 330}, lift = {x: 210, y: 330}, top = {x: 430, y: 70}, foot = {x: 650, y: 330}, right = {x: 760, y: 330};
      const p = Math.max(0, Math.min(1, distance / 8000));
      if (p <= .5) {
        const t = p / .5;
        if (t < .22) {
          const k = t / .22;
          return {x: left.x + (lift.x - left.x) * k, y: left.y};
        }
        const k = (t - .22) / .78;
        return {x: lift.x + (top.x - lift.x) * k, y: lift.y + (top.y - lift.y) * k};
      }
      const t = (p - .5) / .5;
      if (t < .72) {
        const k = t / .72;
        return {x: top.x + (foot.x - top.x) * k, y: top.y + (foot.y - top.y) * k};
      }
      const k = (t - .72) / .28;
      return {x: foot.x + (right.x - foot.x) * k, y: foot.y};
    }

    function foehnHeightFromDistance(distance) {
      if (distance <= 900) return 0;
      if (distance <= 4000) return (distance - 900) / 3100 * 4000;
      if (distance <= 7100) return 4000 - (distance - 4000) / 3100 * 4000;
      return 0;
    }

    function foehnDistanceFromHeight(height, descending = false) {
      const h = Math.max(0, Math.min(4000, height));
      if (descending) return 4000 + (4000 - h) / 4000 * 3100;
      return 900 + h / 4000 * 3100;
    }

    function q2MountainPoint(h) {
      const left = {x: 50, y: 240}, flat = {x: 160, y: 240}, top = {x: 500, y: 42};
      const p = Math.max(0, Math.min(1, h / 4000));
      if (p < .18) {
        const t = p / .18;
        return {x: left.x + (flat.x - left.x) * t, y: left.y};
      }
      const t = (p - .18) / .82;
      return {x: flat.x + (top.x - flat.x) * t, y: flat.y + (top.y - flat.y) * t};
    }

    function q3MountainPoint(h) {
      const left = {x: 56, y: 280}, bend = {x: 196, y: 280}, top = {x: 476, y: 0};
      const p = Math.max(0, Math.min(1, h / 4000));
      return {x: bend.x + (top.x - bend.x) * p, y: bend.y + (top.y - bend.y) * p};
    }

    function q3PointFromDistance(distance) {
      const left = {x: 56, y: 280}, bend = {x: 196, y: 280}, top = {x: 476, y: 0};
      if (distance <= 1000) {
        const k = Math.max(0, distance) / 1000;
        return {x: left.x + (bend.x - left.x) * k, y: left.y};
      }
      const k = Math.max(0, Math.min(1, (distance - 1000) / 4000));
      return {x: bend.x + (top.x - bend.x) * k, y: bend.y + (top.y - bend.y) * k};
    }

    function q3HeightFromDistance(distance) {
      return distance <= 1000 ? 0 : Math.max(0, Math.min(4000, distance - 1000));
    }

    function q3DistanceFromPoint(loc) {
      const x = loc.x - 78;
      if (x <= 196) {
        const t = (x - 56) / (196 - 56);
        return Math.round(Math.max(0, Math.min(1, t)) * 1000 / 50) * 50;
      }
      const t = (x - 196) / (476 - 196);
      return 1000 + Math.round(Math.max(0, Math.min(1, t)) * 4000 / 50) * 50;
    }

    function q5Point(distance) {
      const left = {x: 72, y: 310}, bend = {x: 110, y: 310}, top = {x: 290, y: 70}, foot = {x: 430, y: 310}, right = {x: 500, y: 310};
      const p = Math.max(0, Math.min(1, distance / 8000));
      if (p <= .5) {
        const t = p / .5;
        if (t < .18) {
          const k = t / .18;
          return {x: left.x + (bend.x - left.x) * k, y: left.y};
        }
        const k = (t - .18) / .82;
        return {x: bend.x + (top.x - bend.x) * k, y: bend.y + (top.y - bend.y) * k};
      }
      const t = (p - .5) / .5;
      if (t < .7) {
        const k = t / .7;
        return {x: top.x + (foot.x - top.x) * k, y: top.y + (foot.y - top.y) * k};
      }
      const k = (t - .7) / .3;
      return {x: foot.x + (right.x - foot.x) * k, y: foot.y};
    }

    function renderTabs() {
      tabsEl.innerHTML = '';
      names.forEach((name, i) => {
        const b = document.createElement('button');
        b.className = 'tab';
        b.textContent = name;
        if (i === state.current) b.classList.add('current');
        else if (state.completed.has(i)) b.classList.add('done');
        if (i > state.unlocked) b.classList.add('locked');
        b.disabled = i > state.unlocked;
        b.addEventListener('click', () => {
          if (!ensureStudentName()) return;
          switchModule(i);
        });
        tabsEl.appendChild(b);
      });
    }

    function switchModule(i) {
      if (!ensureStudentName()) return;
      if (i > state.unlocked) return;
      state.current = i;
      modules.forEach((m, idx) => m.classList.toggle('active', idx === i));
      renderTabs();
    }

    function ensureStudentName() {
      const input = document.getElementById('studentName');
      if (!input) return true;
      if (input.value.trim()) {
        lockStudentName();
        return true;
      }
      input.classList.add('needs-value');
      input.focus();
      alert('請先輸入學生代號，才能進行實驗。');
      return false;
    }

    function lockStudentName() {
      const input = document.getElementById('studentName');
      if (!input || !input.value.trim()) return;
      input.disabled = true;
      input.classList.remove('needs-value');
    }

    function guardStudentName(event) {
      const target = event.target;
      if (target.closest('#studentName') || target.closest('#creditsBtn') || target.closest('#creditsDialog')) return;
      if (!document.getElementById('studentName').value.trim()) {
        event.preventDefault();
        event.stopPropagation();
        ensureStudentName();
      }
    }

    function completeModule(i) {
      state.completed.add(i);
      state.unlocked = Math.max(state.unlocked, Math.min(4, i + 1));
      renderTabs();
    }

    function setParcel(group, p, cloud = false, scale = 1) {
      group.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${scale})`);
      const circle = group.querySelector('circle');
      const text = group.querySelector('text');
      if (!circle || !text) return;
      if (cloud) {
        circle.setAttribute('fill', '#ffffff');
        circle.setAttribute('stroke', '#8fb7ca');
        text.textContent = '雲';
        text.setAttribute('fill', '#31526b');
      } else {
        circle.setAttribute('fill', '#f5b54c');
        circle.setAttribute('stroke', '#b27820');
        text.textContent = 'Air';
        text.setAttribute('fill', '#573400');
      }
    }

    function bindDrag(svg, group, setValue, toValue) {
      let dragging = false;
      group.addEventListener('pointerdown', e => {
        dragging = true;
        group.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', e => {
        if (!dragging) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
        setValue(toValue(loc));
      });
      svg.addEventListener('pointerup', e => {
        dragging = false;
        if (group.hasPointerCapture(e.pointerId)) group.releasePointerCapture(e.pointerId);
        if (svg.id === 'q3svg') showQ3Arrow();
      });
    }

    function updateQ1(distance) {
      const h = q1HeightFromDistance(distance);
      const temp = windwardTemp(h);
      const dew = dewpoint(h);
      const p = q1PointFromDistance(distance);
      document.getElementById('q1range').value = distance;
      document.getElementById('q1temp').textContent = `${fmt(temp)}°C`;
      document.getElementById('q1dew').textContent = `${fmt(dew)}°C`;
      document.getElementById('q1h').textContent = `${fmt(h / 1000, 2)} km`;
      document.getElementById('q1x').textContent = `${fmt(distance / 5000 * 60 + 30)} km`;
      setParcel(document.getElementById('q1Parcel'), p, h >= 1250, 1 + h / 16000);
      drawCloudTrail('q1Clouds', h, 1250);
    }

    function renderQ1Page() {
      document.querySelectorAll('[data-q1-page]').forEach(card => {
        card.classList.toggle('active', +card.dataset.q1Page === state.q1Page);
      });
      document.getElementById('q1Prev').disabled = state.q1Page === 0;
      document.getElementById('q1Next').textContent = state.q1Page === 3 ? '進入題目 2' : '下一頁';
      document.getElementById('q1Answer').classList.remove('show');
    }

    function drawCloudTrail(id, h, base) {
      const g = document.getElementById(id);
      g.innerHTML = '';
      for (let mark = Math.ceil(base / 500) * 500; mark <= h; mark += 500) {
        const p = mountainPoint(mark);
        const cloud = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        cloud.setAttribute('cx', p.x);
        cloud.setAttribute('cy', p.y - 12);
        cloud.setAttribute('rx', 24);
        cloud.setAttribute('ry', 14);
        cloud.setAttribute('fill', '#fff');
        cloud.setAttribute('opacity', '.45');
        cloud.setAttribute('stroke', '#8fb7ca');
        g.appendChild(cloud);
      }
    }

    document.getElementById('q1range').addEventListener('input', e => updateQ1(+e.target.value));
    bindDrag(document.getElementById('q1svg'), document.getElementById('q1Parcel'), updateQ1, loc => {
      return q1HeightFromPoint(loc);
    });

    document.getElementById('q1Prev').addEventListener('click', () => {
      state.q1Page = Math.max(0, state.q1Page - 1);
      renderQ1Page();
    });

    document.getElementById('q1Next').addEventListener('click', () => {
      const ans = document.getElementById('q1Answer');
      if (state.q1Page === 0) {
        const h = +document.getElementById('q1height').value;
        if (!h) return alert('請先填寫題目 1-a 的高度。');
        const ok = Math.abs(h - 1250) <= 100;
        if (!ok && !state.q1CanAdvance[0]) {
          ans.innerHTML = '<span class="wrong">正確答案：約 1250 m，也就是 1.25 km。</span>';
          ans.classList.add('show');
          state.q1CanAdvance[0] = true;
          submitAnswer('1-a', {height: h}, {correct: false, expected: '約 1250 m'});
          return;
        }
        submitAnswer('1-a', {height: h}, {correct: ok, expected: '約 1250 m'});
      }
      if (state.q1Page === 1) {
        const rate = document.getElementById('q1rate').value;
        if (!rate) return alert('請先完成題目 1-b。');
        const ok = rate === '大於';
        if (!ok && !state.q1CanAdvance[1]) {
          ans.innerHTML = '<span class="wrong">正確答案：達到飽和前降溫速率大於達到飽和後降溫速率。</span>';
          ans.classList.add('show');
          state.q1CanAdvance[1] = true;
          submitAnswer('1-b', {rate}, {correct: false, expected: '大於'});
          return;
        }
        submitAnswer('1-b', {rate}, {correct: ok, expected: '大於'});
      }
      if (state.q1Page === 2) {
        const why = document.getElementById('q1why').value.trim();
        if (!why) return alert('請先填寫題目 1-c 的猜想。');
        submitAnswer('1-c', {explanation: why}, {correct: null, expected: '飽和後凝結釋放潛熱，降溫速率由約 10°C/km 降為約 6°C/km'});
      }
      if (state.q1Page < 3) {
        state.q1Page += 1;
        renderQ1Page();
        return;
      }
      completeModule(0);
      switchModule(1);
    });

    const q2 = {
      pressure: 23.4,
      initialPressure: 23.4,
      lcl: 1250,
      dew: 17.5,
      summit: 1,
      anim: null
    };

    function q2SatPressureAtTemp(temp) {
      return 6.112 * Math.exp((17.67 * temp) / (temp + 243.5));
    }

    function q2ChartX(temp) {
      return 50 + ((Math.max(-40, Math.min(40, temp)) + 40) / 80) * 280;
    }

    function q2ChartY(pressure) {
      return 240 - (Math.max(0, Math.min(55, pressure)) / 55) * 220;
    }

    function q2CurvePointAtX(x) {
      const curve = document.getElementById('q2SatCurve');
      const total = curve.getTotalLength();
      let lo = 0;
      let hi = total;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (curve.getPointAtLength(mid).x < x) lo = mid;
        else hi = mid;
      }
      return curve.getPointAtLength((lo + hi) / 2);
    }

    function q2CurvePointAtY(y) {
      const curve = document.getElementById('q2SatCurve');
      const total = curve.getTotalLength();
      let lo = 0;
      let hi = total;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (curve.getPointAtLength(mid).y > y) lo = mid;
        else hi = mid;
      }
      return curve.getPointAtLength((lo + hi) / 2);
    }

    function moveQ2Dot(temp, pressure) {
      const dot = document.getElementById('q2Dot');
      const curve = document.getElementById('q2SatCurve');
      if (curve && pressure >= q2SatPressureAtTemp(temp) - 0.05) {
        const p = q2CurvePointAtX(q2ChartX(temp));
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        return;
      }
      dot.setAttribute('cx', q2ChartX(temp));
      dot.setAttribute('cy', q2ChartY(pressure));
    }

    function pressureToDew(e) {
      const ln = Math.log(e / 6.112);
      return 243.5 * ln / (17.67 - ln);
    }

    function updateQ2Pressure(p) {
      q2.pressure = Math.max(7, Math.min(42.5, p));
      q2.initialPressure = q2.pressure;
      const rh = Math.round(q2.pressure / 42.5 * 100);
      const dew = pressureToDew(q2.pressure);
      const lcl = Math.max(0, (30 - dew) / 0.008);
      const summit = windwardTemp(4000, lcl);
      q2.lcl = lcl;
      q2.dew = dew;
      q2.summit = summit;
      document.getElementById('satPressure').textContent = '42.5 hPa';
      document.getElementById('vapPressure').textContent = `${fmt(q2.pressure)} hPa`;
      document.getElementById('rhValue').textContent = `${rh}%`;
      moveQ2Dot(30, q2.pressure);
      updateQ2Air(0, lcl);
    }

    function updateQ2Air(h, lcl = null) {
      if (lcl === null) {
        const dew = pressureToDew(q2.pressure);
        lcl = Math.max(0, (30 - dew) / 0.008);
      }
      const p = q2MountainPoint(h);
      setParcel(document.getElementById('q2Air'), p, h >= lcl, 1 + h / 17000);
      const temp = windwardTemp(h, lcl);
      const vaporPressure = h < lcl ? q2.initialPressure : q2SatPressureAtTemp(temp);
      const satPressure = q2SatPressureAtTemp(temp);
      document.getElementById('q2ObsHeight').textContent = `${Math.round(h)} m`;
      document.getElementById('q2ObsTemp').textContent = `${fmt(temp)}°C`;
      document.getElementById('q2ObsRh').textContent = `${Math.min(100, Math.round(vaporPressure / satPressure * 100))}%`;
      if (h < lcl) {
        const startX = q2ChartX(30);
        const saturationPoint = q2CurvePointAtY(q2ChartY(q2.initialPressure));
        const k = lcl === 0 ? 1 : Math.max(0, Math.min(1, h / lcl));
        const dot = document.getElementById('q2Dot');
        dot.setAttribute('cx', startX + (saturationPoint.x - startX) * k);
        dot.setAttribute('cy', saturationPoint.y);
      } else {
        moveQ2Dot(temp, vaporPressure);
      }
      const trail = document.getElementById('q2Trail');
      trail.innerHTML = '';
      const start = Math.max(lcl, 0);
      for (let mark = start; mark <= h; mark += 180) {
        const base = q2MountainPoint(mark);
        const e = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const puffs = [
          {dx: -14, dy: -18, rx: 18, ry: 11},
          {dx: 4, dy: -24, rx: 20, ry: 14},
          {dx: 22, dy: -16, rx: 17, ry: 10}
        ];
        puffs.forEach(puff => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          c.setAttribute('cx', base.x + puff.dx);
          c.setAttribute('cy', base.y + puff.dy);
          c.setAttribute('rx', puff.rx);
          c.setAttribute('ry', puff.ry);
          c.setAttribute('fill', '#fff');
          c.setAttribute('opacity', '.52');
          c.setAttribute('stroke', '#8fb7ca');
          e.appendChild(c);
        });
        e.setAttribute('opacity', '.9');
        e.setAttribute('fill', '#fff');
        trail.appendChild(e);
      }
    }

    document.getElementById('q2Dot').addEventListener('pointerdown', e => {
      const dot = e.currentTarget;
      dot.setPointerCapture(e.pointerId);
      const move = ev => {
        const svg = document.getElementById('q2ChartSvg');
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
        const y = Math.max(40, Math.min(240, loc.y));
        updateQ2Pressure((240 - y) / 220 * 55);
      };
      const up = ev => {
        dot.releasePointerCapture(ev.pointerId);
        dot.removeEventListener('pointermove', move);
        dot.removeEventListener('pointerup', up);
      };
      dot.addEventListener('pointermove', move);
      dot.addEventListener('pointerup', up);
    });

    document.getElementById('q2Start').addEventListener('click', () => {
      cancelAnimationFrame(q2.anim);
      const start = performance.now();
      const lcl = Math.max(0, (30 - pressureToDew(q2.pressure)) / 0.008);
      const step = now => {
        const k = Math.min(1, (now - start) / 6000);
        updateQ2Air(k * 4000, lcl);
        if (k < 1) q2.anim = requestAnimationFrame(step);
      };
      q2.anim = requestAnimationFrame(step);
    });

    document.getElementById('q2Reset').addEventListener('click', () => {
      cancelAnimationFrame(q2.anim);
      updateQ2Pressure(23.4);
      document.getElementById('q2Trail').innerHTML = '';
    });

    document.getElementById('q2Next').addEventListener('click', () => {
      const box = document.getElementById('q2Answer');
      const written = ['q2a', 'q2b', 'q2c'].map(id => document.getElementById(id).value.trim());
      if (written.some(v => !v)) return alert('請先完成題目 2 的三個回答。');
      if (!box.classList.contains('show')) {
        box.classList.add('show');
        submitAnswer('2', {
          condensationHeightAnswer: written[0],
          dewpointAnswer: written[1],
          summitTempAnswer: written[2],
          vaporPressure: q2.pressure,
          relativeHumidity: Math.round(q2.pressure / 42.5 * 100),
          lcl: `${Math.round(q2.lcl)} m`,
          dewpoint: `${fmt(q2.dew)}°C`,
          summitTemp: `${fmt(q2.summit)}°C`
        }, {correct: null, expected: '水氣壓越高，凝結高度越低，露點越高，山頂溫度越高'});
        state.q2Answered = true;
        return;
      }
      completeModule(1);
      switchModule(2);
    });

    const envs = {
      A: {rate: 4, ans: ['小於', '下沉', '穩定']},
      B: {rate: 12, ans: ['大於', '上升', '不穩定']},
      C: {rate: 8, ans: ['小於', '下沉', '穩定']}
    };

    function updateQ3Prompt() {
      document.getElementById('q3Prompt').textContent = state.env === 'C'
        ? '當空氣塊在環境 C 抬升至 2km 處時，請比較空氣塊與環境的溫度。'
        : `當空氣塊在環境 ${state.env} 抬升至任一處時，請比較空氣塊與環境的溫度。`;
    }

    function renderEnvTabs() {
      const el = document.getElementById('envTabs');
      el.innerHTML = '';
      updateQ3Prompt();
      Object.keys(envs).forEach(k => {
        const b = document.createElement('button');
        b.className = 'env-tab' + (state.env === k ? ' active' : '');
        b.textContent = `環境 ${k}${state.envDone.has(k) ? ' ✓' : ''}`;
        b.addEventListener('click', () => {
          state.env = k;
          document.getElementById('envTitle').textContent = `題目 3-${k.toLowerCase()}1：環境 ${k}`;
          updateQ3Prompt();
          document.getElementById('q3Answer').classList.remove('show');
          ['q3comp','q3move','q3stable'].forEach(id => document.getElementById(id).value = '');
          renderEnvTabs();
          updateQ3(+document.getElementById('q3range').value, false);
        });
        el.appendChild(b);
      });
    }

    function updateQ3(distance, hideArrow = true) {
      const h = q3HeightFromDistance(distance);
      const parcel = windwardTemp(h);
      const env = 30 - envs[state.env].rate * h / 1000;
      const p = q3PointFromDistance(distance);
      document.getElementById('q3range').value = distance;
      document.getElementById('q3h').textContent = `${fmt(h / 1000, 2)} km`;
      document.getElementById('q3parcelTemp').textContent = `${fmt(parcel)}°C`;
      document.getElementById('q3envTemp').textContent = `${fmt(env)}°C`;
      document.getElementById('q3EnvAxis').textContent = state.env;
      renderQ3EnvLabels();
      setParcel(document.getElementById('q3Parcel'), p, h >= 1250, 1 + h / 16000);
      const arrow = document.getElementById('q3Arrow');
      arrow.setAttribute('transform', `translate(${p.x - 52} ${p.y})`);
      if (hideArrow) {
        arrow.style.display = 'none';
        document.getElementById('q3arrowText').textContent = '放開後顯示';
      }
    }

    function renderQ3EnvLabels() {
      const g = document.getElementById('q3EnvLabels');
      if (!g) return;
      const values = [4, 3, 2, 1, 0].map(km => 30 - envs[state.env].rate * km);
      g.innerHTML = values.map((v, i) => `<text x="-50" y="${4 + i * 70}">${fmt(v)}</text>`).join('');
    }

    function showQ3Arrow() {
      const h = +document.getElementById('q3range').value;
      const height = q3HeightFromDistance(h);
      const parcel = windwardTemp(height);
      const env = 30 - envs[state.env].rate * height / 1000;
      const arrow = document.getElementById('q3Arrow');
      const line = arrow.querySelector('line');
      const poly = arrow.querySelector('polygon');
      if (Math.abs(parcel - env) < .05) {
        arrow.style.display = 'none';
        document.getElementById('q3arrowText').textContent = '無';
        return;
      }
      arrow.style.display = '';
      if (parcel > env) {
        line.setAttribute('y1', 6); line.setAttribute('y2', -32);
        poly.setAttribute('points', '0,-48 -15,-24 15,-24');
        document.getElementById('q3arrowText').textContent = '向上';
      } else {
        line.setAttribute('y1', -38); line.setAttribute('y2', 0);
        poly.setAttribute('points', '0,16 -15,-8 15,-8');
        document.getElementById('q3arrowText').textContent = '向下';
      }
    }

    document.getElementById('q3range').addEventListener('input', e => updateQ3(+e.target.value));
    document.getElementById('q3range').addEventListener('change', showQ3Arrow);
    bindDrag(document.getElementById('q3svg'), document.getElementById('q3Parcel'), h => updateQ3(h), loc => {
      return q3DistanceFromPoint(loc);
    });

    document.getElementById('q3Check').addEventListener('click', () => {
      const vals = ['q3comp','q3move','q3stable'].map(id => document.getElementById(id).value);
      if (vals.some(v => !v)) return alert('請先完成三個欄位。');
      if (state.q3ReadyToAdvance && state.envDone.size === 3) {
        completeModule(2);
        switchModule(3);
        return;
      }
      const ans = envs[state.env].ans;
      const html = ans.map((a, i) => vals[i] === a ? `<span class="correct">${a}</span>` : `<span class="wrong">正確答案：${a}</span>`).join('、');
      const box = document.getElementById('q3Answer');
      box.innerHTML = `環境 ${state.env}：${html}`;
      box.classList.add('show');
      submitAnswer(`3-${state.env}`, {comparison: vals[0], tendency: vals[1], stability: vals[2]}, {
        correct: vals.every((v, i) => v === ans[i]),
        expected: ans.join('、')
      });
      state.envDone.add(state.env);
      if (state.envDone.size === 3) {
        state.q3ReadyToAdvance = true;
        document.getElementById('q3Check').textContent = '進入下一題';
        completeModule(2);
      }
      renderEnvTabs();
    });

    function snapQ4Distance(distance) {
      const snaps = [1250, 4000, 6750];
      const hit = snaps.find(value => Math.abs(distance - value) <= 120);
      return hit ?? distance;
    }

    function updateQ4(distance) {
      distance = snapQ4Distance(distance);
      const descending = distance > 4000;
      const h = distance <= 4000 ? distance : 8000 - distance;
      const pathDistance = foehnDistanceFromHeight(h, descending);
      const temp = descending ? 1 + (4000 - h) / 100 : windwardTemp(h, 1250);
      const dew = descending ? 1 + (4000 - h) * .002 : dewpoint(h, 1250);
      const saturated = !descending && h >= 1250;
      const p = foehnPoint(pathDistance);
      const scale = descending ? 1 + h / 17000 : 1 + h / 15000;
      document.getElementById('q4range').value = distance;
      document.getElementById('q4h').textContent = `${Math.round(h)} m`;
      document.getElementById('q4temp').textContent = `${fmt(temp)}°C`;
      document.getElementById('q4dew').textContent = `${fmt(dew)}°C`;
      document.getElementById('q4state').textContent = saturated ? '飽和成雲' : '未飽和';
      setParcel(document.getElementById('q4Parcel'), p, saturated, scale);
    }

    document.getElementById('q4range').addEventListener('input', e => updateQ4(+e.target.value));
    bindDrag(document.getElementById('q4svg'), document.getElementById('q4Parcel'), updateQ4, loc => {
      if (loc.x <= 210) return 0;
      if (loc.x <= 430) return Math.round((loc.x - 210) / (430 - 210) * 4000);
      if (loc.x <= 650) return Math.round(4000 + (loc.x - 430) / (650 - 430) * 4000);
      return 8000;
    });

    function renderQ4Page() {
      document.querySelectorAll('.q4page').forEach((p, i) => p.style.display = i === state.q4Page ? '' : 'none');
      document.querySelectorAll('[data-q4page]').forEach((b, i) => {
        b.classList.toggle('active', i === state.q4Page);
        b.textContent = `4-${String.fromCharCode(97 + i)}${state.q4AnsweredPages[i] ? ' ✓' : ''}`;
      });
      document.getElementById('q4Answer').classList.remove('show');
      document.getElementById('q4Prev').disabled = state.q4Page === 0;
      document.getElementById('q4Next').textContent = state.q4Page === 2 ? '完成' : '下一頁';
    }

    document.querySelectorAll('[data-q4page]').forEach(b => b.addEventListener('click', () => {
      state.q4Page = +b.dataset.q4page;
      renderQ4Page();
    }));

    document.querySelectorAll('.q4choice').forEach(b => b.addEventListener('click', () => {
      state.q4Choice[b.dataset.name] = b.dataset.value;
      document.querySelectorAll(`.q4choice[data-name="${b.dataset.name}"]`).forEach(x => x.classList.toggle('selected', x === b));
    }));

    document.getElementById('q4Prev').addEventListener('click', () => {
      state.q4Page = Math.max(0, state.q4Page - 1);
      renderQ4Page();
    });

    document.getElementById('q4Next').addEventListener('click', () => {
      const box = document.getElementById('q4Answer');
      if (state.q4AnsweredPages[state.q4Page]) {
        if (state.q4Page < 2) {
          state.q4Page += 1;
          renderQ4Page();
        } else {
          completeModule(3);
          switchModule(4);
        }
        return;
      }
      if (state.q4Page === 0) {
        const vals = ['q4a1','q4a2','q4a3'].map(id => +document.getElementById(id).value);
        if (vals.some(v => Number.isNaN(v))) return alert('請先填完三個溫度。');
        const ans = [17.5, 1, 41];
        box.innerHTML = ans.map((a, i) => Math.abs(vals[i] - a) <= .2 ? `<span class="correct">${a}°C</span>` : `<span class="wrong">正確答案：${a}°C</span>`).join('、');
        box.classList.add('show');
        submitAnswer('4-a', {windward1250m: vals[0], summit4km: vals[1], leeward0km: vals[2]}, {
          correct: vals.every((v, i) => Math.abs(v - ans[i]) <= .2),
          expected: ans.join('、')
        });
        state.q4AnsweredPages[0] = true;
        renderQ4Page();
        box.classList.add('show');
        document.getElementById('q4Next').textContent = '看完解答，下一頁';
      } else if (state.q4Page === 1) {
        if (!state.q4Choice.dir || !state.q4Choice.state || !document.getElementById('q4bReason').value.trim()) return alert('請先完成選項與原因。');
        const ok1 = state.q4Choice.dir === '上升';
        const ok2 = state.q4Choice.state === '未飽和（乾）';
        box.innerHTML = `${ok1 ? '<span class="correct">上升</span>' : '<span class="wrong">正確答案：上升</span>'} 10°C/km；${ok2 ? '<span class="correct">未飽和（乾）</span>' : '<span class="wrong">正確答案：未飽和（乾）</span>'}。原因：背風面空氣塊下沉後為未飽和空氣，依乾絕熱率增溫。`;
        box.classList.add('show');
        submitAnswer('4-b', {direction: state.q4Choice.dir, state: state.q4Choice.state, reason: document.getElementById('q4bReason').value.trim()}, {
          correct: ok1 && ok2,
          expected: '上升、未飽和（乾）'
        });
        state.q4AnsweredPages[1] = true;
        renderQ4Page();
        box.classList.add('show');
        document.getElementById('q4Next').textContent = '看完解答，下一頁';
      } else {
        if (!document.getElementById('q4cReason').value.trim()) return alert('請先輸入原因。');
        box.innerHTML = '參考答案：背風面空氣塊下沉，外界壓力變大，空氣塊體積收縮而增溫。';
        box.classList.add('show');
        submitAnswer('4-c', {reason: document.getElementById('q4cReason').value.trim()}, {
          correct: null,
          expected: '下沉、壓力變大、體積收縮增溫'
        });
        state.q4AnsweredPages[2] = true;
        renderQ4Page();
        box.classList.add('show');
        document.getElementById('q4Next').textContent = '看完解答，進入下一題';
      }
    });

    document.getElementById('q5HintBtn').addEventListener('click', () => {
      document.querySelectorAll('.q5-hints .hint').forEach(hint => hint.classList.toggle('show'));
    });

    function q5HeightFromDistance(distance) {
      if (distance <= 720) return 0;
      if (distance <= 4000) return (distance - 720) / 3280 * 4000;
      if (distance <= 6800) return 4000 - (distance - 4000) / 2800 * 4000;
      return 0;
    }

    function updateQ5(distance) {
      document.getElementById('q5range').value = distance;
      const p = q5Point(distance);
      const height = q5HeightFromDistance(distance);
      setParcel(document.getElementById('q5Parcel'), p, distance < 4000 && height > 2000, 1);
    }

    document.getElementById('q5range').addEventListener('input', e => updateQ5(+e.target.value));
    bindDrag(document.getElementById('q5svg'), document.getElementById('q5Parcel'), updateQ5, loc => {
      const x = loc.x - 70;
      const value = x < 290 ? (x - 72) / (290 - 72) * 4000 : 4000 + (x - 290) / (500 - 290) * 4000;
      return Math.round(Math.max(0, Math.min(8000, value)) / 50) * 50;
    });

    document.getElementById('q5Next').addEventListener('click', () => {
      if (!document.getElementById('q5ans').value.trim()) return alert('請先輸入你的推論。');
      if (state.q5Answered) {
        completeModule(4);
        return;
      }
      document.getElementById('q5Answer').classList.add('show');
      submitAnswer('5-a', {answer: document.getElementById('q5ans').value.trim()}, {
        correct: null,
        expected: '38°C；比題目 4 低 3°C'
      });
      state.q5Answered = true;
      document.getElementById('q5Next').textContent = '看完解答，完成';
    });

    document.getElementById('creditsBtn').addEventListener('click', () => document.getElementById('creditsDialog').showModal());
    document.getElementById('closeCredits').addEventListener('click', () => document.getElementById('creditsDialog').close());
    document.querySelector('main').addEventListener('click', guardStudentName, true);
    document.querySelector('main').addEventListener('pointerdown', guardStudentName, true);
    tabsEl.addEventListener('click', guardStudentName, true);
    document.getElementById('studentName').addEventListener('input', e => {
      e.currentTarget.classList.toggle('needs-value', !e.currentTarget.value.trim());
    });
    document.getElementById('studentName').addEventListener('change', lockStudentName);
    document.getElementById('studentName').addEventListener('keydown', e => {
      if (e.key === 'Enter') lockStudentName();
    });
    document.getElementById('studentName').value = '';
    setTimeout(() => document.getElementById('studentName').focus(), 0);

    renderTabs();
    renderQ1Page();
    renderEnvTabs();
    renderQ4Page();
    updateQ1(0);
    updateQ2Pressure(23.4);
    updateQ3(0);
    updateQ4(0);
    updateQ5(0);
