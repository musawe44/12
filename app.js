(() => {
  "use strict";

  // البصرة (ثابت) — تقدر تغيّره لاحقاً إلى geolocation
  const BASRA = { lat: 30.5085, lon: 47.7804, name: "البصرة" };
  const BAGHDAD_TZ = "Asia/Baghdad";

  const CFG = {
    hotTempC: 30,
    windyMS: 10,
    gustMS: 14,
    dripPerSecAtHot: 2.0,
    puddleMaxH: 120,
    windShakePx: 9,
    weatherRefreshMs: 10 * 60 * 1000,
  };

  // UI
  const els = {
    temp: byId("temp"),
    wind: byId("wind"),
    hum: byId("hum"),
    feel: byId("feel"),
    updated: byId("updated"),
    badge: byId("badge"),
    coords: byId("coords"),
    bgTime: byId("bgTime"),
    bgDate: byId("bgDate"),
    greg: byId("greg"),
    hijri: byId("hijri"),
    weekday: byId("weekday"),
    fxRoot: byId("fx-root"),
    puddle: byId("puddle"),
  };

  const windows = Array.from(document.querySelectorAll("[data-window]"));

  function byId(id){ return document.getElementById(id); }
  const clamp = (v,a,b)=>Math.max(a, Math.min(b,v));
  const rand = (a,b)=>a + Math.random()*(b-a);

  // ---------------- Clock بغداد (iPhone كبير)
  function tickClock(){
    const now = new Date();

    // وقت بغداد
    const timeFmt = new Intl.DateTimeFormat("ar-IQ", {
      timeZone: BAGHDAD_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const dateFmt = new Intl.DateTimeFormat("ar-IQ", {
      timeZone: BAGHDAD_TZ,
      year: "numeric",
      month: "long",
      day: "2-digit"
    });

    els.bgTime.textContent = timeFmt.format(now);
    els.bgDate.textContent = dateFmt.format(now);

    // التقويم العربي
    const greg = new Intl.DateTimeFormat("ar-IQ", {
      timeZone: BAGHDAD_TZ,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "2-digit"
    }).format(now);

    // هجري (Islamic) عبر Intl
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      timeZone: BAGHDAD_TZ,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "2-digit"
    }).format(now);

    els.greg.textContent = "الميلادي: " + greg;
    els.hijri.textContent = "الهجري: " + hijri;

    els.weekday.textContent = "المنطقة الزمنية: بغداد";
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------------- Weather (Open-Meteo)
  // نستخدم current: temp, humidity, wind, apparent_temperature
  async function fetchBasraWeather(){
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(BASRA.lat)}` +
      `&longitude=${encodeURIComponent(BASRA.lon)}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m` +
      `&timezone=auto`;

    const r = await fetch(url);
    if(!r.ok) throw new Error("weather http " + r.status);
    const j = await r.json();

    const c = j.current || {};
    return {
      tempC: Number(c.temperature_2m),
      hum: Number(c.relative_humidity_2m),
      feelC: Number(c.apparent_temperature),
      windMS: Number(c.wind_speed_10m),
      updatedISO: c.time,
    };
  }

  let state = { tempC: null, windMS: null };

  function setBadge(tempC, windMS){
    const hot = tempC != null && tempC > CFG.hotTempC;
    const windy = windMS != null && windMS > CFG.windyMS;

    let txt = "هادئ";
    if(hot && windy) txt = "حار + رياح";
    else if(hot) txt = "حار";
    else if(windy) txt = "رياح";
    els.badge.textContent = txt;

    // تفعيل الذوبان
    windows.forEach(w => {
      w.classList.toggle("fx-hot", hot);
      w.classList.toggle("fx-melt", hot);
    });
  }

  async function refreshWeather(){
    try{
      els.coords.textContent = BASRA.name;
      const w = await fetchBasraWeather();

      els.temp.textContent = Number.isFinite(w.tempC) ? w.tempC.toFixed(1) : "--";
      els.wind.textContent = Number.isFinite(w.windMS) ? w.windMS.toFixed(1) : "--";
      els.hum.textContent  = Number.isFinite(w.hum) ? w.hum.toFixed(0) : "--";
      els.feel.textContent = Number.isFinite(w.feelC) ? w.feelC.toFixed(1) : "--";

      if(w.updatedISO){
        els.updated.textContent = "آخر تحديث: " + new Date(w.updatedISO).toLocaleString("ar-IQ");
      }

      state.tempC = w.tempC;
      state.windMS = w.windMS;
      setBadge(w.tempC, w.windMS);
    }catch(e){
      els.updated.textContent = "تعذر جلب الطقس الآن.";
      console.warn(e);
    }
  }
  refreshWeather();
  setInterval(refreshWeather, CFG.weatherRefreshMs);

  // ---------------- FX: قطرات + بركة + Splash + رياح
  let puddleH = 0;
  let dripAcc = 0;
  let windPhase = 0;

  function rect(el){ return el.getBoundingClientRect(); }

  function splash(x,y){
    const s = document.createElement("div");
    s.className = "fx-splash";
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    els.fxRoot.appendChild(s);
    s.addEventListener("animationend", () => s.remove(), { once:true });
  }

  function createDrop(fromEl){
    const r = rect(fromEl);
    const x = rand(r.left + 28, r.right - 28);
    const y = r.bottom - 6;

    const d = document.createElement("div");
    d.className = "fx-drop";
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    els.fxRoot.appendChild(d);

    const vy0 = rand(180, 260);
    const g = rand(900, 1200);
    const start = performance.now();

    function step(now){
      const t = (now - start) / 1000;
      const yy = y + vy0*t + 0.5*g*t*t;

      // اصطدام بالنوافذ الأخرى
      const dx = parseFloat(d.style.left);
      for(const w of windows){
        if(w === fromEl) continue;
        const rr = rect(w);
        if(dx >= rr.left && dx <= rr.right && yy >= rr.top && yy <= rr.bottom){
          splash(dx, yy);
          d.remove();
          return;
        }
      }

      // الأرض / البركة
      const ground = window.innerHeight - puddleH;
      if(yy >= ground){
        splash(dx, ground);
        d.remove();
        puddleH = clamp(puddleH + rand(2,4), 0, CFG.puddleMaxH);
        els.puddle.style.height = `${puddleH}px`;
        return;
      }

      d.style.top = `${yy}px`;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function makeGust(y = rand(70, window.innerHeight - 160)){
    const g = document.createElement("div");
    g.className = "fx-gust";
    g.style.top = `${y}px`;
    g.style.left = `-240px`;
    g.innerHTML = `
      <svg viewBox="0 0 200 60" preserveAspectRatio="none">
        <path d="M10,35 C40,10 70,55 100,30 C130,5 150,40 190,18" />
      </svg>`;
    els.fxRoot.appendChild(g);
    requestAnimationFrame(() => g.classList.add("run"));
    g.addEventListener("animationend", () => g.remove(), { once:true });
  }

  function fxLoop(){
    const tempC = state.tempC;
    const windMS = state.windMS;

    // Drips عند الحر
    if(tempC != null && tempC > CFG.hotTempC){
      const hotFactor = clamp((tempC - CFG.hotTempC) / 10, 0, 1.8);
      const rate = CFG.dripPerSecAtHot * hotFactor; // drop/sec
      dripAcc += rate / 60;

      while(dripAcc >= 1){
        dripAcc -= 1;
        const w = windows[Math.floor(Math.random()*windows.length)];
        createDrop(w);
      }
    }else{
      // تبخر خفيف
      puddleH = clamp(puddleH - 0.06, 0, CFG.puddleMaxH);
      els.puddle.style.height = `${puddleH}px`;
    }

    // Wind: هبات + هز + طي
    if(windMS != null && windMS > CFG.windyMS){
      const p = clamp((windMS - CFG.windyMS) / 8, 0, 1);

      if(Math.random() < 0.08 + p*0.10) makeGust();

      windPhase += 0.12 + p*0.10;
      const shake = CFG.windShakePx * (0.25 + p*0.75);

      windows.forEach((w, i) => {
        const dx = Math.sin(windPhase + i*0.9) * shake;
        const dy = Math.cos(windPhase*0.85 + i*0.7) * (shake*0.35);
        w.style.translate = `${dx}px ${dy}px`;
      });

      if(windMS > CFG.gustMS && Math.random() < 0.06){
        const w = windows[Math.floor(Math.random()*windows.length)];
        w.classList.remove("fx-fold");
        void w.offsetWidth;
        w.classList.add("fx-fold");
      }
    }else{
      windows.forEach(w => w.style.translate = `0px 0px`);
    }

    requestAnimationFrame(fxLoop);
  }
  requestAnimationFrame(fxLoop);

})();
